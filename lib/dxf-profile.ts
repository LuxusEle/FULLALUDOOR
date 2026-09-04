export type ProfilePoint={x:number;y:number};
export type ProfileLoop={points:ProfilePoint[];area:number};
export type DxfProfile={id:string;outer:ProfileLoop;holes:ProfileLoop[];width:number;height:number;minX:number;minY:number};

type DxfVertex=ProfilePoint&{bulge:number};
const cache=new Map<string,Promise<DxfProfile>>();

function signedArea(points:ProfilePoint[]){let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}return area/2;}

function flatten(vertices:DxfVertex[]){
  const points:ProfilePoint[]=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];points.push({x:a.x,y:a.y});
    if(Math.abs(a.bulge)<1e-9)continue;
    const dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy),theta=4*Math.atan(a.bulge);
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,offset=chord*(1-a.bulge*a.bulge)/(4*a.bulge);
    const cx=mx-dy/chord*offset,cy=my+dx/chord*offset,start=Math.atan2(a.y-cy,a.x-cx),radius=Math.hypot(a.x-cx,a.y-cy);
    const steps=Math.max(2,Math.ceil(Math.abs(theta)/(Math.PI/36)));
    for(let step=1;step<steps;step++){const angle=start+theta*step/steps;points.push({x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius});}
  }
  return points.filter((point,index)=>index===0||Math.hypot(point.x-points[index-1].x,point.y-points[index-1].y)>1e-7);
}

export function parseDxfProfile(id:string,text:string):DxfProfile{
  const raw=text.replace(/\r/g,'').split('\n'),pairs:{code:number;value:string}[]=[];
  for(let i=0;i+1<raw.length;i+=2)pairs.push({code:Number(raw[i].trim()),value:raw[i+1].trim()});
  const sectionStart=pairs.findIndex((pair,index)=>pair.code===0&&pair.value==='SECTION'&&pairs[index+1]?.code===2&&pairs[index+1]?.value==='ENTITIES');
  if(sectionStart<0)throw new Error(`${id}: ENTITIES section not found`);
  const sectionEnd=pairs.findIndex((pair,index)=>index>sectionStart&&pair.code===0&&pair.value==='ENDSEC');
  const loops:ProfileLoop[]=[];
  for(let i=sectionStart+2;i<(sectionEnd<0?pairs.length:sectionEnd);i++){
    if(pairs[i].code!==0||pairs[i].value!=='LWPOLYLINE')continue;
    const vertices:DxfVertex[]=[];let closed=false;i++;
    for(;i<pairs.length&&pairs[i].code!==0;i++){
      const pair=pairs[i];
      if(pair.code===70)closed=(Number(pair.value)&1)===1;
      else if(pair.code===10)vertices.push({x:Number(pair.value),y:0,bulge:0});
      else if(pair.code===20&&vertices.length)vertices[vertices.length-1].y=Number(pair.value);
      else if(pair.code===42&&vertices.length)vertices[vertices.length-1].bulge=Number(pair.value);
    }
    i--;if(closed&&vertices.length>=3){const points=flatten(vertices);loops.push({points,area:signedArea(points)});}
  }
  if(!loops.length)throw new Error(`${id}: no closed LWPOLYLINE profile loops found`);
  loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
  const outer=loops[0],holes=loops.slice(1),all=loops.flatMap(loop=>loop.points);
  const xs=all.map(p=>p.x),ys=all.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return{id,outer,holes,width:maxX-minX,height:maxY-minY,minX,minY};
}

export function loadDxfProfile(id:string){
  let pending=cache.get(id);
  if(!pending){pending=fetch(`/profiles/alumex/${id}.dxf`).then(response=>{if(!response.ok)throw new Error(`${id}: DXF request failed (${response.status})`);return response.text();}).then(text=>parseDxfProfile(id,text));cache.set(id,pending);}
  return pending;
}
