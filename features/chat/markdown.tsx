"use client"

import { memo, useState } from "react"
import Link from "next/link"
import { Check, Copy } from "lucide-react"
import { parseMarkdown, type Block, type Inline, type ListItem } from "@/lib/chat/markdown"
import { cn } from "@/lib/utils"

function Inl({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text": return <span key={i}>{n.v}</span>
      case "b": return <strong key={i} className="font-semibold"><Inl nodes={n.c} /></strong>
      case "i": return <em key={i}><Inl nodes={n.c} /></em>
      case "code": return <code key={i} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.88em]">{n.v}</code>
      case "money": return <span key={i} data-money className="tabular-nums">{n.v}</span>
      case "a": return n.href.startsWith("/")
        ? <Link key={i} href={n.href} className="font-semibold text-link underline-offset-2 hover:underline"><Inl nodes={n.c} /></Link>
        : <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline-offset-2 hover:underline"><Inl nodes={n.c} /></a>
    }
  })
}

function CodeBlock({ v, lang }: { v: string; lang: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="group/code relative my-2 overflow-hidden rounded-xl bg-[#1F2B4B] text-[#E7F5D9]">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-white/60"><span>{lang || "texto"}</span>
        <button type="button" className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" onClick={() => { navigator.clipboard?.writeText(v); setOk(true); setTimeout(() => setOk(false), 1500) }}>
          {ok ? <Check className="size-3" /> : <Copy className="size-3" />}{ok ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-[13px] leading-relaxed"><code>{v}</code></pre>
    </div>
  )
}

function List({ ordered, items, start }: { ordered: boolean; items: ListItem[]; start?: number }) {
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag start={start} className={cn("my-1.5 grid gap-1 pl-5", ordered ? "list-decimal marker:font-semibold marker:text-muted-foreground" : "list-disc marker:text-brand")}>
      {items.map((it, i) => <li key={i} className="pl-0.5"><Inl nodes={it.c} />{it.sub && <List ordered={it.sub.ordered} items={it.sub.items} />}</li>)}
    </Tag>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((b, i) => {
    switch (b.t) {
      case "h": {
        const cls = b.level <= 2 ? "mt-3 mb-1 text-[17px] font-bold" : "mt-2.5 mb-0.5 text-[15px] font-semibold"
        return b.level <= 2 ? <h3 key={i} className={cls}><Inl nodes={b.c} /></h3> : <h4 key={i} className={cls}><Inl nodes={b.c} /></h4>
      }
      case "p": return <p key={i} className="my-1.5 first:mt-0 last:mb-0">{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inl nodes={l} /></span>)}</p>
      case "ul": case "ol": return <List key={i} ordered={b.t === "ol"} items={b.items} start={b.t === "ol" ? b.start : undefined} />
      case "quote": return <blockquote key={i} className="my-2 border-l-4 border-brand/40 bg-brand-soft/40 py-1 pr-2 pl-3 text-[0.97em]"><Blocks blocks={b.blocks} /></blockquote>
      case "code": return <CodeBlock key={i} v={b.v} lang={b.lang} />
      case "hr": return <hr key={i} className="my-3 border-border" />
      case "table": return (
        <div key={i} className="my-2 max-w-full overflow-x-auto rounded-xl ring-1 ring-border">
          <table className="w-full text-[13.5px]">
            <thead className="bg-secondary/70"><tr>{b.head.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ textAlign: b.align[j] ?? undefined }}><Inl nodes={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, k) => <tr key={k} className="border-t border-border/70">{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top tabular-nums" style={{ textAlign: b.align[j] ?? undefined }}><Inl nodes={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    }
  })
}

/** Markdown del chat (lib/chat/markdown.ts) con montos marcados para el modo privado. */
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn("text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]", className)}><Blocks blocks={parseMarkdown(text)} /></div>
})
