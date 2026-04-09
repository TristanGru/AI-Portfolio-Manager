type Props = {
  content?: string;
  className?: string;
  skipTopLevelHeading?: boolean;
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function parseMarkdown(content?: string): Block[] {
  const lines = (content ?? "").split(/\r?\n/);
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" ")
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      type: "list",
      items: listItems
    });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2]
      });
      continue;
    }

    const listMatch = /^-\s+(.*)$/.exec(line);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export function MarkdownDocument({ content, className, skipTopLevelHeading = false }: Props) {
  const parsedBlocks = parseMarkdown(content);
  const blocks =
    skipTopLevelHeading && parsedBlocks[0]?.type === "heading" && parsedBlocks[0].level === 1
      ? parsedBlocks.slice(1)
      : parsedBlocks;

  if (blocks.length === 0) {
    return (
      <div className={className}>
        <p className="muted">Nothing generated yet.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return <h3 key={`${block.type}-${index}`}>{block.text}</h3>;
          }

          if (block.level === 2) {
            return <h4 key={`${block.type}-${index}`}>{block.text}</h4>;
          }

          return <h5 key={`${block.type}-${index}`}>{block.text}</h5>;
        }

        if (block.type === "list") {
          return (
            <ul key={`${block.type}-${index}`} className="markdown-list">
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }

        return <p key={`${block.type}-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}
