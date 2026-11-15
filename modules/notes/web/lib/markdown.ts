/*
 * A small Markdown → HTML converter for AI replies inserted into a page.
 * Covers what the prompt allows: headings, paragraphs, bullet/numbered/task
 * lists, quotes, code blocks, rules, bold, italic, inline code and links.
 * Everything is HTML-escaped first and links must be http(s)/mailto, and the
 * result still goes through Tiptap's schema, which drops anything unknown.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(md: string): string {
  const codes: string[] = [];
  let s = esc(md).replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return `\u0001${codes.length - 1}\u0001`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => (/^(https?:\/\/|mailto:)/i.test(url) ? `<a href="${url}">${text}</a>` : text));
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a?: string, b?: string) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, (_m, p1 = "", a?: string, p3 = "", b?: string) => `${p1 || p3}<em>${a ?? b}</em>`);
  s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return s.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
}

/** Removes a ```markdown … ``` wrapper some models add despite being asked not to. */
export function unfence(md: string): string {
  const m = md.trim().match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```$/i);
  return m ? m[1] : md;
}

export function markdownToHtml(md: string): string {
  const lines = unfence(md).replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol" | "task"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    if (list.tag === "task") out.push(`<ul data-type="taskList">${list.items.join("")}</ul>`);
    else out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^```/.test(t)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    if (/^>\s?/.test(t)) {
      flushPara();
      flushList();
      quote.push(t.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = Math.min(3, h[1].length);
      out.push(`<h${level}>${inline(h[2].replace(/\s+#+$/, ""))}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      out.push("<hr>");
      continue;
    }
    const task = t.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    const bullet = t.match(/^[-*+]\s+(.*)$/);
    const num = t.match(/^\d+[.)]\s+(.*)$/);
    if (task || bullet || num) {
      flushPara();
      const tag = task ? "task" : bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      if (task) list.items.push(`<li data-type="taskItem" data-checked="${task[1] !== " "}"><p>${inline(task[2])}</p></li>`);
      else list.items.push(`<li><p>${inline((bullet ?? num)![1])}</p></li>`);
      continue;
    }
    // A wrapped line continuing the last list item.
    if (list && /^\s{2,}\S/.test(line)) {
      const lastIdx = list.items.length - 1;
      list.items[lastIdx] = list.items[lastIdx].replace(/<\/p><\/li>$/, ` ${inline(t)}</p></li>`);
      continue;
    }
    flushList();
    para.push(t);
  }
  flush();
  return out.join("");
}

/** True when the HTML is a single paragraph, so it can replace text inside a line. */
export function singleParagraph(html: string): string | null {
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  return m && !m[1].includes("<p>") ? m[1] : null;
}
