import { runtime, terminalCss } from "../../assets/terminal-runtime";
export type TerminalPacket = {
  type: "ready" | "ack" | "input" | "resize";
  nonce: string;
  next?: number;
  dataBase64?: string;
  cols?: number;
  rows?: number;
};
export function terminalDocument(nonce: string) {
  const setup = `(()=>{const nonce=${JSON.stringify(nonce)};let cursor=0,active=false,freshPty=false;const protocol=[];for(const event of ["keydown","beforeinput","paste","compositionstart","drop"]){document.addEventListener(event,e=>{if(!active){e.preventDefault();e.stopImmediatePropagation();}},true);}const send=p=>{const message=JSON.stringify({...p,nonce});if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else parent.postMessage(message,"*");};const {Terminal,FitAddon}=window.BycodaTerminalRuntime;const term=new Terminal({cols:80,rows:24,scrollback:2000,disableStdin:true,allowProposedApi:false,fontSize:14,convertEol:false});const fit=new FitAddon();term.loadAddon(fit);term.open(document.getElementById("terminal"));const bytes=(data,binary=false)=>{if(!active){if(freshPty&&!binary&&protocol.length<16&&data.length<=128&&data.charCodeAt(0)===27&&data[1]==="["&&/^[0-9;?>=]*[Rnc]$/.test(data.slice(2)))protocol.push(data);return;}const bytes=binary?Uint8Array.from(data,c=>c.charCodeAt(0)&255):new TextEncoder().encode(data);for(let i=0;i<bytes.length;i+=4096){let text="";for(const byte of bytes.subarray(i,i+4096))text+=String.fromCharCode(byte);send({type:"input",dataBase64:btoa(text)});}};term.onData(data=>bytes(data));term.onBinary(data=>bytes(data,true));term.onResize(({cols,rows})=>send({type:"resize",cols,rows}));window.byCodaTerminalAccept=p=>{if(!p||p.nonce!==nonce)return;if(p.type==="configure"){active=!!p.active;freshPty=!!p.freshPty;term.options.disableStdin=!active&&!freshPty;if(active){const pending=protocol.splice(0);if(freshPty)for(const data of pending)bytes(data);}else if(!freshPty)protocol.length=0;if(p.theme){term.options.theme=p.theme;document.body.style.background=p.theme.background;}if(active)term.focus();return;}if(p.type==="output"&&p.after===cursor&&typeof p.dataBase64==="string"&&p.dataBase64.length<=44000){const raw=atob(p.dataBase64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));term.write(bytes,()=>{cursor=p.next;send({type:"ack",next:cursor});});}};window.addEventListener("message",event=>{if(event.source!==parent)return;try{window.byCodaTerminalAccept(typeof event.data==="string"?JSON.parse(event.data):event.data);}catch{}});new ResizeObserver(()=>{try{fit.fit();}catch{}}).observe(document.getElementById("terminal"));try{fit.fit();}catch{}send({type:"ready",cols:term.cols,rows:term.rows});})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; font-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${terminalCss}html,body,#terminal{margin:0;width:100%;height:100%;background:#111;color:#eee;overflow:hidden}</style></head><body><div id="terminal"></div><script>${runtime.replace(/<\/script/gi, "<\\/script")}</script><script>${setup.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
export function readTerminalPacket(raw: string, nonce: string): TerminalPacket | null {
  if (raw.length > 7000) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      value.nonce !== nonce ||
      !["ready", "ack", "input", "resize"].includes(value.type) ||
      Object.keys(value).some(
        (key) => !["type", "nonce", "next", "dataBase64", "cols", "rows"].includes(key),
      )
    )
      return null;
    if (
      value.type === "input" &&
      (typeof value.dataBase64 !== "string" ||
        !value.dataBase64.length ||
        value.dataBase64.length > 5500 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.dataBase64))
    )
      return null;
    if (value.type === "ack" && (!Number.isSafeInteger(value.next) || value.next < 0)) return null;
    if (
      (value.type === "ready" || value.type === "resize") &&
      (!Number.isInteger(value.cols) ||
        !Number.isInteger(value.rows) ||
        value.cols < 2 ||
        value.cols > 400 ||
        value.rows < 2 ||
        value.rows > 200)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
