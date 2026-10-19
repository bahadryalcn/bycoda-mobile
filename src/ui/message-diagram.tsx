import { useMobileTheme } from "@/ui/theme";
import { useMemo, useState } from "react";
import { View } from "react-native";
import runtime from "../../assets/mermaid-runtime";
import { Body, Button, Sheet } from "./primitives";
import { HtmlPreview } from "./html-preview";
import { useCopy } from "./copy";
import { colors, space } from "./tokens";

export function MessageDiagram({ source }: { source: string }) {
  const { mode } = useMobileTheme();
  const copy = useCopy(); const [open, setOpen] = useState(false);
  const allowed = source.length <= 32_000 && source.split("\n").length <= 400;
  const failureText = copy("Diyagram çizilemedi. Kaynak kodu aşağıda.", "This diagram could not be rendered. Its source is below.");
  const html = useMemo(() => {
    const encoded = JSON.stringify(source).replace(/</g, "\\u003c");
    return `<style>body{margin:0;background:${colors.panel};color:${colors.text};font:14px system-ui}#diagram{overflow:auto;padding:12px;min-height:160px}svg{display:block;max-width:none!important}#error{padding:12px;white-space:pre-wrap}button{font:inherit;padding:12px;background:${colors.raised};color:inherit;border:0;border-radius:8px}</style><button onclick="resizeDiagram(.25)">+</button> <button onclick="resizeDiagram(-.25)">−</button><div id="diagram"></div><div id="error"></div><script>var diagramZoom=1;function resizeDiagram(delta){diagramZoom=Math.max(.25,Math.min(4,diagramZoom+delta));var box=document.getElementById('diagram'),svg=box.querySelector('svg');if(!svg)return;var view=svg.viewBox.baseVal;if(!view.width||!view.height)return;var fit=Math.min(1,Math.max(1,box.clientWidth-24)/view.width);svg.style.width=view.width*fit*diagramZoom+'px';svg.style.height=view.height*fit*diagramZoom+'px';}window.addEventListener('resize',function(){resizeDiagram(0)});byCodaMermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:${JSON.stringify(mode === "dark" ? "dark" : "default")},maxTextSize:32000,maxEdges:300,suppressErrorRendering:true,flowchart:{htmlLabels:false,useMaxWidth:false}});byCodaMermaid.render('diagram-svg',${encoded}).then(function(result){document.getElementById('diagram').innerHTML=result.svg;resizeDiagram(0)}).catch(function(){document.getElementById('error').textContent=${JSON.stringify(copy("Diyagram çizilemedi. Kaynak kodu aşağıda.", "This diagram could not be rendered. Its source is below."))}});</script>`;
  }, [source, failureText, mode]);
  if (!allowed) return <Body muted>{copy("Diyagram önizleme sınırını aşıyor; kaynak kodunu kullan.", "Diagram exceeds the preview limit; use its source.")}</Body>;
  return <View style={{ gap: space.xs }}><HtmlPreview html={html} trustedRuntime={runtime} height={250} /><Button tone="quiet" density="compact" label={copy("Diyagramı büyüt", "Expand diagram")} onPress={() => setOpen(true)} /><Sheet visible={open} title={copy("Diyagram", "Diagram")} size="full" onClose={() => setOpen(false)}>{open ? <HtmlPreview html={html} trustedRuntime={runtime} height={620} /> : null}</Sheet></View>;
}
