import * as THREE from '../vendor/three/build/three.module.js';

// Small self-contained BSP CSG engine for the editable part meshes. The input
// meshes are evaluated in world space and the result is returned in the target
// mesh's local space, preserving the target transform and one mesh record.
const CSG_EPSILON=1e-8;
const CSG_POINT_EPSILON=1e-9;
const CSG_AREA_EPSILON=1e-12;
function cleanPolygonVertices(vertices){
  const result=[];
  for(const vertex of vertices){
    if(!result.length||result[result.length-1].pos.distanceToSquared(vertex.pos)>CSG_POINT_EPSILON**2)result.push(vertex);
  }
  if(result.length>2&&result[0].pos.distanceToSquared(result[result.length-1].pos)<=CSG_POINT_EPSILON**2)result.pop();
  let changed=true;
  while(changed&&result.length>=3){
    changed=false;
    for(let i=0;i<result.length;i++){
      const previous=result[(i+result.length-1)%result.length].pos;
      const current=result[i].pos;
      const next=result[(i+1)%result.length].pos;
      const edgeA=current.clone().sub(previous),edgeB=next.clone().sub(current);
      if(edgeA.lengthSq()<=CSG_POINT_EPSILON**2||edgeB.lengthSq()<=CSG_POINT_EPSILON**2||edgeA.cross(edgeB).lengthSq()<=CSG_AREA_EPSILON){result.splice(i,1);changed=true;break}
    }
  }
  return result.length>=3?result:null;
}
function makePolygon(vertices){
  const cleaned=cleanPolygonVertices(vertices);
  if(!cleaned)return null;
  const polygon=new CSGPolygon(cleaned);
  return polygon.plane?polygon:null;
}
class CSGVertex{
  constructor(pos,normal){this.pos=pos;this.normal=normal||new THREE.Vector3()}
  clone(){return new CSGVertex(this.pos.clone(),this.normal.clone())}
  interpolate(other,t){return new CSGVertex(this.pos.clone().lerp(other.pos,t),this.normal.clone().lerp(other.normal,t).normalize())}
}
class CSGPlane{
  constructor(normal,w){this.normal=normal;this.w=w}
  clone(){return new CSGPlane(this.normal.clone(),this.w)}
  flip(){this.normal.negate();this.w=-this.w}
  static fromPoints(a,b,c){const normal=b.pos.clone().sub(a.pos).cross(c.pos.clone().sub(a.pos));if(normal.lengthSq()<=CSG_AREA_EPSILON)return null;normal.normalize();return new CSGPlane(normal,normal.dot(a.pos))}
  splitPolygon(polygon,coplanarFront,coplanarBack,front,back){
    const COPLANAR=0,FRONT=1,BACK=2,SPANNING=3;let polygonType=COPLANAR,types=[];
    for(const vertex of polygon.vertices){const t=this.normal.dot(vertex.pos)-this.w;const type=t<-CSG_EPSILON?BACK:t>CSG_EPSILON?FRONT:COPLANAR;polygonType|=type;types.push(type)}
    if(polygonType===COPLANAR){(this.normal.dot(polygon.plane.normal)>0?coplanarFront:coplanarBack).push(polygon);return}
    if(polygonType===FRONT){front.push(polygon);return}
    if(polygonType===BACK){back.push(polygon);return}
    const f=[],b=[];
    for(let i=0;i<polygon.vertices.length;i++){
      const j=(i+1)%polygon.vertices.length,ti=types[i],tj=types[j],vi=polygon.vertices[i],vj=polygon.vertices[j];
      if(ti!==BACK)f.push(vi);
      if(ti!==FRONT)b.push(vi.clone());
      if((ti|tj)===SPANNING){const direction=vj.pos.clone().sub(vi.pos),denominator=this.normal.dot(direction);const t=Math.abs(denominator)<CSG_EPSILON?0:(this.w-this.normal.dot(vi.pos))/denominator;const v=vi.interpolate(vj,Math.max(0,Math.min(1,t)));f.push(v);b.push(v.clone())}
    }
    const frontPolygon=makePolygon(f),backPolygon=makePolygon(b);if(frontPolygon)front.push(frontPolygon);if(backPolygon)back.push(backPolygon);
  }
}
class CSGPolygon{
  constructor(vertices){this.vertices=vertices;this.plane=CSGPlane.fromPoints(vertices[0],vertices[1],vertices[2])}
  clone(){return new CSGPolygon(this.vertices.map(v=>v.clone()))}
  flip(){this.vertices.reverse().forEach(v=>{v.normal.negate()});this.plane.flip()}
}
class CSGNode{
  constructor(polygons=[]){this.plane=null;this.front=null;this.back=null;this.polygons=[];if(polygons.length)this.build(polygons)}
  invert(){for(const polygon of this.polygons)polygon.flip();this.plane?.flip();this.front?.invert();this.back?.invert();[this.front,this.back]=[this.back,this.front]}
  clipPolygons(polygons){if(!this.plane)return polygons;const front=[],back=[];for(const polygon of polygons)this.plane.splitPolygon(polygon,front,back,front,back);if(this.front)front.splice(0,front.length,...this.front.clipPolygons(front));if(this.back)back.splice(0,back.length,...this.back.clipPolygons(back));else back.length=0;return front.concat(back)}
  clipTo(other){this.polygons=other.clipPolygons(this.polygons);this.front?.clipTo(other);this.back?.clipTo(other)}
  allPolygons(){let result=this.polygons.slice();if(this.front)result=result.concat(this.front.allPolygons());if(this.back)result=result.concat(this.back.allPolygons());return result}
  build(polygons){if(!polygons.length)return;if(!this.plane)this.plane=polygons[0].plane.clone();const front=[],back=[];for(const polygon of polygons)this.plane.splitPolygon(polygon,this.polygons,this.polygons,front,back);if(front.length){if(!this.front)this.front=new CSGNode();this.front.build(front)}if(back.length){if(!this.back)this.back=new CSGNode();this.back.build(back)}}
}
function csgFromMesh(object){
  object.updateWorldMatrix(true,false);const geometry=object.geometry,index=geometry.index?.array,position=geometry.attributes.position,normal=geometry.attributes.normal,matrix=object.matrixWorld,polygons=[];
  const readNormal=(i,a,b,c)=>{if(normal)return new THREE.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)).transformDirection(matrix);return b.clone().sub(a).cross(c.clone().sub(a)).normalize()};
  const triangleCount=index?index.length/3:position.count/3;
  for(let i=0;i<triangleCount;i++){
    const ia=index?index[i*3]:i*3,ib=index?index[i*3+1]:i*3+1,ic=index?index[i*3+2]:i*3+2;
    const a=new THREE.Vector3().fromBufferAttribute(position,ia).applyMatrix4(matrix),b=new THREE.Vector3().fromBufferAttribute(position,ib).applyMatrix4(matrix),c=new THREE.Vector3().fromBufferAttribute(position,ic).applyMatrix4(matrix),faceNormal=readNormal(ia,a,b,c);
    const vertices=[new CSGVertex(a,normal?readNormal(ia,a,b,c):faceNormal.clone()),new CSGVertex(b,normal?readNormal(ib,a,b,c):faceNormal.clone()),new CSGVertex(c,normal?readNormal(ic,a,b,c):faceNormal.clone())];
    const polygon=makePolygon(vertices);if(polygon)polygons.push(polygon);
  }
  return new CSGNode(polygons);
}
export function subtractMesh(target,cutters){
  target.updateWorldMatrix(true,false);const inverseTarget=target.matrixWorld.clone().invert();let node=csgFromMesh(target);
  for(const cutter of cutters){const cutterNode=csgFromMesh(cutter);if(!cutterNode.allPolygons().length)continue;const a=node,b=cutterNode;a.invert();a.clipTo(b);b.clipTo(a);b.invert();b.clipTo(a);b.invert();a.build(b.allPolygons());a.invert();node=a}
  const polygons=node.allPolygons();if(!polygons.length)return null;
  const raw=[];for(const polygon of polygons)for(let i=2;i<polygon.vertices.length;i++)for(const vertex of [polygon.vertices[0],polygon.vertices[i-1],polygon.vertices[i]])raw.push(vertex.pos.clone().applyMatrix4(inverseTarget));
  const geometry=cleanOutput(raw);if(!geometry)return null;return geometry;
}

// A CSG subtraction can leave several disconnected solid islands in one
// non-indexed BufferGeometry. Split those islands into independent geometries
// so the editor can select, move or delete either cut-off portion on its own.
export function splitDisconnectedGeometry(geometry){
  const position=geometry?.attributes?.position;
  if(!position||position.count<3)return geometry?[geometry]:[];
  const bounds=new THREE.Box3().setFromBufferAttribute(position),size=bounds.getSize(new THREE.Vector3()),tolerance=Math.max(1e-7,Math.max(size.x,size.y,size.z)*1e-5),vertices=[],buckets=new Map(),triangleVertices=[];
  const vertexIndex=point=>{const key=[Math.round(point.x/tolerance),Math.round(point.y/tolerance),Math.round(point.z/tolerance)].join(','),candidates=buckets.get(key)||[];for(const index of candidates)if(vertices[index].distanceToSquared(point)<=tolerance*tolerance)return index;const index=vertices.length;vertices.push(point.clone());candidates.push(index);buckets.set(key,candidates);return index};
  for(let i=0;i+2<position.count;i+=3)triangleVertices.push([0,1,2].map(offset=>vertexIndex(new THREE.Vector3().fromBufferAttribute(position,i+offset))));
  const linked=new Map();triangleVertices.forEach((ids,triangle)=>ids.forEach(id=>{const list=linked.get(id)||[];list.push(triangle);linked.set(id,list)}));
  const visited=new Uint8Array(triangleVertices.length),components=[];
  for(let root=0;root<triangleVertices.length;root++)if(!visited[root]){visited[root]=1;const component=[],queue=[root];while(queue.length){const triangle=queue.pop();component.push(triangle);for(const id of triangleVertices[triangle])for(const neighbor of linked.get(id)||[])if(!visited[neighbor]){visited[neighbor]=1;queue.push(neighbor)}}components.push(component)}
  if(components.length===1)return[geometry];
  const normal=geometry.attributes.normal;
  return components.map(component=>{const positions=[],normals=[];for(const triangle of component)for(let offset=0;offset<3;offset++){const index=triangle*3+offset;positions.push(position.getX(index),position.getY(index),position.getZ(index));if(normal)normals.push(normal.getX(index),normal.getY(index),normal.getZ(index))}const part=new THREE.BufferGeometry();part.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(normals.length)part.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));else part.computeVertexNormals();part.computeBoundingBox();part.computeBoundingSphere();part.userData.record={type:'buffer',position:Array.from(part.attributes.position.array),normal:Array.from(part.attributes.normal.array)};return part});
}

// BSP clipping can calculate the same intersection independently on adjacent
// source triangles. Weld those points before rendering; otherwise tiny gaps,
// duplicate triangles and inconsistent winding become visible after a second
// subtraction, especially on shallow spherical pockets.
function cleanOutput(raw){
  if(raw.length<3)return null;
  const bounds=new THREE.Box3().setFromPoints(raw),size=bounds.getSize(new THREE.Vector3()),tolerance=Math.max(1e-7,Math.max(size.x,size.y,size.z)*1e-5),vertices=[],buckets=new Map();
  const vertexIndex=point=>{const key=[Math.round(point.x/tolerance),Math.round(point.y/tolerance),Math.round(point.z/tolerance)].join(',');const candidates=buckets.get(key)||[];for(const index of candidates)if(vertices[index].distanceToSquared(point)<=tolerance*tolerance){return index}const index=vertices.length;vertices.push(point);candidates.push(index);buckets.set(key,candidates);return index};
  const triangles=[],seen=new Set();
  for(let i=0;i+2<raw.length;i+=3){const ids=[vertexIndex(raw[i]),vertexIndex(raw[i+1]),vertexIndex(raw[i+2])];if(new Set(ids).size<3)continue;const a=vertices[ids[0]],b=vertices[ids[1]],c=vertices[ids[2]];if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()<=CSG_AREA_EPSILON)continue;const key=[...ids].sort((x,y)=>x-y).join(',');if(seen.has(key))continue;seen.add(key);triangles.push(ids)}
  if(!triangles.length)return null;
  const edgeMap=new Map();
  triangles.forEach((triangle,index)=>{for(let edge=0;edge<3;edge++){const a=triangle[edge],b=triangle[(edge+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,direction=a<b?1:-1;const list=edgeMap.get(key)||[];list.push({index,direction});edgeMap.set(key,list)}});
  const flip=new Array(triangles.length).fill(null),components=[];
  for(let root=0;root<triangles.length;root++)if(flip[root]===null){flip[root]=false;const component=[root],queue=[root];while(queue.length){const index=queue.pop();const triangle=triangles[index];for(let edge=0;edge<3;edge++){const a=triangle[edge],b=triangle[(edge+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,entries=edgeMap.get(key)||[];if(entries.length!==2)continue;const current=entries.find(entry=>entry.index===index),other=entries.find(entry=>entry.index!==index);if(!other)continue;const desired=flip[index]^(current.direction===other.direction);if(flip[other.index]===null){flip[other.index]=desired;component.push(other.index);queue.push(other.index)}}}components.push(component)}
  // Do not orient components by their independent signed volume: BSP clipping
  // can leave open/T-junction component fragments whose volume sign is not a
  // valid winding signal. Edge propagation above preserves source orientation.
  const positions=[];for(let i=0;i<triangles.length;i++){const triangle=triangles[i];if(flip[i])[triangle[1],triangle[2]]=[triangle[2],triangle[1]];for(const index of triangle)positions.push(vertices[index])}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions.flatMap(point=>point.toArray()),3));geometry.computeVertexNormals();geometry.userData.record={type:'buffer',position:Array.from(geometry.attributes.position.array),normal:Array.from(geometry.attributes.normal.array)};return geometry;
}
