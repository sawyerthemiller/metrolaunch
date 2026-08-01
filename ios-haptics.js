/**
* ios-haptics v3.0.0
* tijn.dev
* @license MIT
**/
function e(e){if(!e)return;let t=document.createElement(`input`);t.type=`checkbox`,t.setAttribute(`switch`,``),Object.assign(t.style,{position:`absolute`,top:0,left:0,width:`100%`,height:`100%`,margin:0,opacity:0,cursor:`pointer`,clipPath:`inset(0 round 999px)`,touchAction:`manipulation`}),t.style.setProperty(`-webkit-tap-highlight-color`,`transparent`),e.style.position=`relative`,e.insertAdjacentElement(`beforeend`,t)}export{e as hapticTrigger};
