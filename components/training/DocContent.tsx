// Minimal renderer for the plain-text/lightweight-markdown convention used in
// contentBody for doc modules (# / ## headings, "- " bullets, blank-line
// paragraphs, **bold**). Not a full markdown parser — deliberately small
// rather than pulling in a markdown dependency for this one use case.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

export function DocContent({ body }: { body: string }) {
  const lines = body.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {renderInline(paragraph.join(" "))}
        </p>
      );
      paragraph = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      flushList();
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={blocks.length} className="text-base font-semibold">
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={blocks.length} className="text-lg font-semibold">
          {renderInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="space-y-3 text-sm">{blocks}</div>;
}
