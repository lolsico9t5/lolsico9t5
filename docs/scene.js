import { createWingRig } from "./wing-rig.js?v=2";
import { planEdgeTurn, advanceEdgeTurn } from "./flight-turn.js";
import { createBreath } from "./fire.js";

export function startFlight(root, heroElement, assetURL = name => name) {
  const lifecycle = new AbortController();
  const events = { signal:lifecycle.signal };
  const flight = root.querySelector("#flight");
  const dragon = root.querySelector("#creature");
  const rigCanvas = root.querySelector("#rig");
  const texture = root.querySelector("#texture");
  const sidePose = dragon.querySelector(".side-pose");
  function loadPose(filename) {
    const image=new Image();
    image.className="turn-pose"; image.alt=""; image.draggable=false;
    image.src=assetURL(filename);
    dragon.append(image);
    return image;
  }
  const quarterPose=loadPose("bank-quarter.webp"), frontPose=loadPose("bank-front.webp");
  const fire = root.querySelector("#fire");
  const land = root.querySelector("#land");
  const help = root.querySelector("#help");
  const guide = root.querySelector("#guide");
  const effects = createBreath(root.querySelector("#effects"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const keys = new Set();
  const directions = {ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0],
    ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1]};
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi,value));
  const blend = (rate,dt) => 1-Math.exp(-rate*dt);
  let width=1,height=1,size=180,x,y,vx=0,vy=0,face=-1,heading=Math.PI,headingRate=0,roll=0,pitch=0,phase=0,heat=0;
  let turn=null, lastPreference=reduced.matches;
  let active=!reduced.matches, drag=null, rig=null, frame=0, previous=0, elapsed=0, idle=0;
  let burst=0, firePointer=null, space=false, demo=!reduced.matches, helpTime=7, patrol=0;

  // Fixed screen coordinates keep the dragon within reach at every scroll position.
  // Edge steering advances the document underneath it, including during a continuous touch drag.
  function resize() {
    const oldW=width,oldH=height;
    if(lifecycle.signal.aborted) return;
    width=document.documentElement.clientWidth; height=flight.clientHeight;
    size=parseFloat(getComputedStyle(dragon).width);
    if (!Number.isFinite(size)) size=clamp(width*.26,150,360);
    if (x===undefined) {
      const hero=heroElement?.getBoundingClientRect() ?? {right:width*.9,top:0,width:width*.75};
      x=clamp(hero.right-size*.46,size*.43,width-size*.43);
      y=clamp(hero.top+hero.width*.336*.58,60,height*.45);
    } else {
      x*=width/oldW; y*=height/oldH;
    }
    const ratio=Math.min(2,devicePixelRatio);
    rigCanvas.width=Math.round(size*ratio);rigCanvas.height=Math.round(size*.5*ratio);
    turn=null; effects.resize(width,height); constrain(); paint(0); request();
  }
  function flightArea() {
    const mx=Math.min(size*.43,width*.35), my=Math.min(size*.23,height*.27);
    return {left:mx,right:width-mx,top:my,bottom:Math.max(my,height-my-64)};
  }
  function constrain() {
    const box=flightArea();
    x=clamp(x,box.left,box.right); y=clamp(y,box.top,box.bottom);
  }
  function request() {
    if(!frame && active && !document.hidden) frame=requestAnimationFrame(tick);
  }
  function nearEdge(coordinate,margin) {
    if(coordinate<margin) return -clamp((margin-coordinate)/margin,0,1);
    if(coordinate>height-margin) return clamp((coordinate-(height-margin))/margin,0,1);
    return 0;
  }
  function pan(edge,dt) {
    if(!edge) return;
    const max=document.documentElement.scrollHeight-height;
    const next=clamp(scrollY+Math.sign(edge)*Math.pow(Math.abs(edge),1.3)*Math.min(970,height*1.38)*dt,0,Math.max(0,max));
    if (Math.abs(next-scrollY)>.5) window.scrollTo({top:next,behavior:"instant"});
  }
  // Exact critically damped spring keeps tracking consistent at different frame rates.
  function follow(position,velocity,goal,dt,omega=24) {
    const delta=position-goal, spring=velocity+omega*delta, decay=Math.exp(-omega*dt);
    return [goal+(delta+spring*dt)*decay,(velocity-omega*spring*dt)*decay];
  }
  function steer(dt) {
    let kx=0,ky=0;
    for(const key of keys) {kx+=directions[key][0];ky+=directions[key][1];}
    const box=flightArea();
    // Up/down input is also how the player travels between profile sections.
    const cameraMoving=ky<0 && scrollY>1 || ky>0 && scrollY+height<document.documentElement.scrollHeight-1;
    if(!drag && !turn && !cameraMoving) turn=planEdgeTurn(x,y,vx,vy,box,size);
    const banking=Boolean(turn);
    if(turn) {
      const next=advanceEdgeTurn(turn,dt);
      x=next.x; y=next.y; vx=next.vx; vy=next.vy;
      if(next.done) {turn=null;idle=0;}
    } else if(drag) {
      [x,vx]=follow(x,vx,clamp(drag.px-drag.ox,box.left,box.right),dt);
      [y,vy]=follow(y,vy,clamp(drag.py-drag.oy,box.top,box.bottom),dt);
      pan(nearEdge(drag.py,Math.min(96,height*.16)),dt);
      idle=0;
    } else if(kx || ky) {
      const norm=Math.hypot(kx,ky), speed=Math.min(570,width*1.13);
      vx+=(kx/norm*speed-vx)*blend(9,dt); vy+=(ky/norm*speed-vy)*blend(9,dt);
      x+=vx*dt;y+=vy*dt;
      if(ky) pan(nearEdge(y,Math.min(height*.35,size*.24+160)),dt);
      idle=0;
    } else {
      idle+=dt;
      if(idle>3.2 && !reduced.matches) {
        // Cruise around the currently visible part of the profile; scrolling remains in the reader's hands.
        patrol+=dt*.31;
        const goalX=width*.5+Math.cos(patrol)*(width*.5-size*.55);
        const goalY=height*(.36+.18*Math.sin(patrol)) + 7*Math.sin(phase*1.6);
        const cruise=Math.min(155,width*.27);
        vx+=(clamp((goalX-x)*1.25,-cruise,cruise)-vx)*blend(2.4,dt);
        vy+=(clamp((goalY-y)*1.25,-cruise*.65,cruise*.65)-vy)*blend(2.4,dt);
      } else {
        const decay=Math.exp(-2.25*dt);vx*=decay;vy*=decay;
      }
      x+=vx*dt;y+=vy*dt;
    }
    const speed=Math.hypot(vx,vy);
    if(Math.abs(vx)>18) face=Math.sign(vx);
    let desiredHeading=face>0 ? 0 : Math.PI;
    if(drag && speed<36) {
      if(x-box.left<7 && face<0) desiredHeading=Math.PI*.61;
      if(box.right-x<7 && face>0) desiredHeading=Math.PI*.39;
    }
    if(banking && speed>9) desiredHeading=Math.acos(clamp(vx/speed,-1,1));
    // Smooth angular acceleration into and out of the bank; the head leads the tail.
    [heading,headingRate]=follow(heading,headingRate,desiredHeading,dt,7.2);
    heading=clamp(heading,0,Math.PI);
    const targetPitch=speed>20 ? clamp(Math.atan2(vy,Math.max(38,Math.abs(vx))),-1.02,1.02) : .04*Math.sin(phase);
    pitch+=(targetPitch-pitch)*blend(7,dt);
    roll+=(-clamp(headingRate*.16,-.66,.66)-roll)*blend(7,dt);
    constrain();
  }
  function smooth(a,b,v) {
    const t=clamp((v-a)/(b-a),0,1);
    return t*t*(3-2*t);
  }
  function paint(dt) {
    if(!Number.isFinite(x)) return;
    const pace=Math.min(1,Math.hypot(vx,vy)/520);
    const yaw=Math.cos(heading), extent=Math.abs(yaw), sign=yaw<0?-1:1;
    const bank=clamp(Math.sin(pitch)*yaw+roll,-1,1);
    phase+=dt*(1.6+pace*2.5+heat*.58);
    const lift=active && !reduced.matches ? Math.sin(2*phase+.4)*size*.009 : 0;
    const bodyY=y+lift, angle=pitch*yaw+roll*Math.sin(heading);
    dragon.style.transform='translate3d('+(x-size/2)+'px,'+(bodyY-size/4)+'px,0) rotate('+angle+'rad)';
    const havePoses=quarterPose.complete && quarterPose.naturalWidth && frontPose.complete && frontPose.naturalWidth;
    const side=havePoses ? smooth(.66,.91,extent) : 1;
    const front=havePoses ? 1-smooth(.15,.45,extent) : 0;
    const quarter=1-side-front;
    const noseX=.434*yaw*size;
    // Register all three snouts on the same moving point during the change of view.
    const sideWidth=(.77+.23*extent)*sign, quarterWidth=(.75+.23*extent)*sign;
    sidePose.style.opacity=side;
    sidePose.style.transform='translateX('+(noseX-.434*size*sideWidth)+'px) scaleX('+sideWidth+')';
    quarterPose.style.opacity=quarter;
    quarterPose.style.transform='translateX('+(noseX-.341*size*quarterWidth)+'px) scale('+quarterWidth+','+(1+.026*Math.sin(2*phase))+')';
    frontPose.style.opacity=front;
    frontPose.style.transform='translateX('+noseX+'px) scale('+(1-.15*extent)+','+(1+.032*Math.sin(2*phase))+')';
    if(side>.001) rig?.(phase,bank,heat,pace);
    const beat=Math.sin(phase*2+.5)*.010-bank*.008;
    const mx=noseX-side*.011*heat*size*sign;
    const my=(.051+side*.86*(beat-.010*heat))*size*.5;
    const c=Math.cos(angle),s=Math.sin(angle);
    const dirX=yaw,dirY=.09+.51*Math.sin(heading), norm=Math.hypot(dirX,dirY);
    const mouth={x:x+mx*c-my*s,y:bodyY+mx*s+my*c,dx:(dirX*c-dirY*s)/norm,dy:(dirX*s+dirY*c)/norm};
    effects.draw(dt,mouth,size,active ? heat : 0);
  }
  function tick(now) {
    frame=0;
    if(lastPreference!==reduced.matches) applyMotionPreference();
    if(!active || document.hidden) return;
    const dt=previous ? Math.min((now-previous)/1000,.05) : 1/60;
    previous=now; elapsed+=dt;
    if(demo && elapsed>1.15) {burst=.72;demo=false;}
    if(helpTime>0 && (helpTime-=dt)<=0) showHelp(false);
    burst=Math.max(0,burst-dt);
    const firing=burst>0 || firePointer!==null || space;
    heat+=((firing?1:0)-heat)*blend(firing?15:8,dt);
    steer(dt);paint(dt);request();
  }
  function showHelp(show) {
    guide.hidden=!show;
    help.setAttribute("aria-expanded",String(show));
  }
  function engage() {
    demo=false; idle=0;
    if(!active) setActive(true);
  }
  function clearInputs() {
    if(drag && dragon.hasPointerCapture(drag.id)) dragon.releasePointerCapture(drag.id);
    drag=null; keys.clear();space=false;firePointer=null;burst=0;
  }
  function setActive(value) {
    active=value;clearInputs();turn=null;idle=0;vx=vy=0;heat=0;
    dragon.hidden=!value; fire.hidden=!value; land.textContent=value?"Land dragon":"Launch dragon";
    effects.clear();previous=0;
    if(!value) { cancelAnimationFrame(frame);frame=0;showHelp(false); }
    else {resize();request();}
  }
  dragon.addEventListener("pointerdown",e=>{
    if(!e.isPrimary || e.button!==0 || drag) return;
    engage(); turn=null; dragon.dataset.pointerFocus="";
    drag={id:e.pointerId,px:e.clientX,py:e.clientY,ox:e.clientX-x,oy:e.clientY-y,
      startX:e.clientX,startY:e.clientY,last:e.timeStamp,fx:0,fy:0,moved:false};
    dragon.setPointerCapture(e.pointerId); dragon.focus({preventScroll:true});
  });
  function recordPointer(e) {
    if(!drag || drag.id!==e.pointerId) return;
    const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
    if(dx || dy) {
      const dt=clamp((e.timeStamp-drag.last)/1000,1/240,.14);
      const gain=blend(26,dt);
      drag.fx+=(clamp(dx/dt,-1500,1500)-drag.fx)*gain;
      drag.fy+=(clamp(dy/dt,-1500,1500)-drag.fy)*gain;
      drag.last=e.timeStamp;
      drag.px=e.clientX;drag.py=e.clientY;
      drag.moved ||= Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6;
    }
  }
  dragon.addEventListener("pointermove",recordPointer);
  dragon.addEventListener("blur",()=>delete dragon.dataset.pointerFocus);
  function release(e) {
    if(!drag || drag.id!==e.pointerId) return;
    recordPointer(e);
    const flick=drag.moved && e.type==="pointerup";
    const fresh=Math.exp(-Math.max(0,e.timeStamp-drag.last)/85);
    if(flick) {
      vx=clamp(.32*vx+.68*drag.fx*fresh,-950,950);
      vy=clamp(.32*vy+.68*drag.fy*fresh,-950,950);
      if(Math.hypot(vx,vy)>360) burst=.43;
      if(Math.hypot(vx,vy)<30) {
        const box=flightArea();
        if(x-box.left<7) vx=-72;
        else if(box.right-x<7) vx=72;
        else if(y-box.top<7) vy=-64;
        else if(box.bottom-y<7) vy=64;
      }
    } else {
      vx=vy=0;
      if(e.type==="pointerup") burst=.70;
    }
    drag=null;idle=0;
  }
  for(const type of ["pointerup","pointercancel","lostpointercapture"]) dragon.addEventListener(type,release);
  dragon.addEventListener("click",e=>{ if(e.detail===0) {engage();burst=.7;} });
  fire.addEventListener("pointerdown",e=>{
    if(e.button!==0 || firePointer!==null) return;
    engage(); firePointer=e.pointerId;burst=.52;fire.setPointerCapture(e.pointerId);
  });
  for(const type of ["pointerup","pointercancel","lostpointercapture"]) fire.addEventListener(type,e=>{if(e.pointerId===firePointer) firePointer=null;});
  fire.addEventListener("click",e=>{if(e.detail===0) {engage();burst=.72;}});
  land.addEventListener("click",()=>{demo=false;setActive(!active);if(active) dragon.focus({preventScroll:true});});
  help.addEventListener("click",()=>{helpTime=0;showHelp(guide.hidden);});
  document.addEventListener("keydown",e=>{
    const origin=e.composedPath()[0];
    if(!active || e.ctrlKey || e.metaKey || e.altKey || (origin!==document.body && origin!==dragon)) return;
    if(e.code in directions) {e.preventDefault();engage();delete dragon.dataset.pointerFocus;if(!keys.has(e.code)) turn=null;keys.add(e.code);}
    if(e.code==="Space") {e.preventDefault();engage();space=true;if(!e.repeat) burst=.48;}
  },events);
  document.addEventListener("keyup",e=>{keys.delete(e.code);if(e.code==="Space") space=false;},events);
  window.addEventListener("blur",clearInputs,events);
  document.addEventListener("visibilitychange",()=>{previous=0;if(document.hidden) clearInputs();else request();},events);
  function applyMotionPreference() {
    if(lastPreference===reduced.matches) return;
    lastPreference=reduced.matches; demo=false; setActive(!lastPreference);
  }
  reduced.addEventListener("change",applyMotionPreference,events);
  rigCanvas.addEventListener("webglcontextlost",e=>{e.preventDefault();rig=null;if(!lifecycle.signal.aborted) showFallback();});
  function showFallback() {
    dragon.classList.remove("rigged");
    if (!dragon.querySelector(".sprite")) {
      const image=new Image();
      image.className="sprite"; image.src=assetURL("gliding.webp"); image.alt=""; image.draggable=false;
      sidePose.append(image);
    }
  }
  function mountRig() {
    if(lifecycle.signal.aborted) return;
    try {rig=createWingRig(rigCanvas,texture);} catch {rig=null;}
    if(rig) dragon.classList.add("rigged"); else showFallback();
    paint(0);request();
  }
  rigCanvas.addEventListener("webglcontextrestored",mountRig);
  flight.hidden=false;
  resize();setActive(active);
  window.addEventListener("resize",resize,events);
  texture.decode().then(mountRig).catch(()=>{});

  return () => {
    lifecycle.abort();
    active=false; clearInputs(); cancelAnimationFrame(frame); effects.clear();
    // Release GPU resources when the host navigates away and removes the overlay.
    if(rig) rigCanvas.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
