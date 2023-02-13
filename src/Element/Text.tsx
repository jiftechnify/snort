import "./Text.css";
import { useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { visit, SKIP } from "unist-util-visit";

import { UrlRegex, MentionRegex, InvoiceRegex, HashtagRegex } from "Const";
import { eventLink, hexToBech32, unwrap } from "Util";
import Invoice from "Element/Invoice";
import Hashtag from "Element/Hashtag";

import Tag from "Nostr/Tag";
import { MetadataCache } from "State/Users";
import Mention from "Element/Mention";
import HyperText from "Element/HyperText";
import { HexKey } from "Nostr";
import * as unist from "unist";

export type Fragment = string | React.ReactNode;

export interface TextFragment {
  body: React.ReactNode[];
  tags: Tag[];
  users: Map<string, MetadataCache>;
}

export interface TextProps {
  content: string;
  creator: HexKey;
  tags: Tag[];
  users: Map<string, MetadataCache>;
}

export default function Text({ content, tags, creator, users }: TextProps) {
  function extractLinks(fragments: Fragment[]) {
    return fragments
      .map(f => {
        if (typeof f === "string") {
          return f.split(UrlRegex).map(a => {
            if (a.startsWith("http")) {
              return <HyperText key={a} link={a} creator={creator} />;
            }
            return a;
          });
        }
        return f;
      })
      .flat();
  }

  function extractMentions(frag: TextFragment) {
    return frag.body
      .map(f => {
        if (typeof f === "string") {
          return f.split(MentionRegex).map(match => {
            const matchTag = match.match(/#\[(\d+)\]/);
            if (matchTag && matchTag.length === 2) {
              const idx = parseInt(matchTag[1]);
              const ref = frag.tags?.find(a => a.Index === idx);
              if (ref) {
                switch (ref.Key) {
                  case "p": {
                    return <Mention key={ref.PubKey} pubkey={ref.PubKey ?? ""} />;
                  }
                  case "e": {
                    const eText = hexToBech32("note", ref.Event).substring(0, 12);
                    return (
                      <Link key={ref.Event} to={eventLink(ref.Event ?? "")} onClick={e => e.stopPropagation()}>
                        #{eText}
                      </Link>
                    );
                  }
                  case "t": {
                    return <Hashtag key={ref.Hashtag} tag={ref.Hashtag ?? ""} />;
                  }
                }
              }
              return <b style={{ color: "var(--error)" }}>{matchTag[0]}?</b>;
            } else {
              return match;
            }
          });
        }
        return f;
      })
      .flat();
  }

  function extractInvoices(fragments: Fragment[]) {
    return fragments
      .map(f => {
        if (typeof f === "string") {
          return f.split(InvoiceRegex).map(i => {
            if (i.toLowerCase().startsWith("lnbc")) {
              return <Invoice key={i} invoice={i} />;
            } else {
              return i;
            }
          });
        }
        return f;
      })
      .flat();
  }

  function extractHashtags(fragments: Fragment[]) {
    return fragments
      .map(f => {
        if (typeof f === "string") {
          return f.split(HashtagRegex).map(i => {
            if (i.toLowerCase().startsWith("#")) {
              return <Hashtag key={i} tag={i.substring(1)} />;
            } else {
              return i;
            }
          });
        }
        return f;
      })
      .flat();
  }

  function transformLi(frag: TextFragment) {
    const fragments = transformText(frag);
    return <li>{fragments}</li>;
  }

  function transformParagraph(frag: TextFragment) {
    const fragments = transformText(frag);
    if (fragments.every(f => typeof f === "string")) {
      return <p>{fragments}</p>;
    }
    return <>{fragments}</>;
  }

  function transformText(frag: TextFragment) {
    let fragments = extractMentions(frag);
    fragments = extractLinks(fragments);
    fragments = extractInvoices(fragments);
    fragments = extractHashtags(fragments);
    return fragments;
  }

  const components = useMemo(() => {
    return {
      p: (x: { children?: React.ReactNode[] }) => transformParagraph({ body: x.children ?? [], tags, users }),
      a: (x: { href?: string }) => <HyperText link={x.href ?? ""} creator={creator} />,
      li: (x: { children?: Fragment[] }) => transformLi({ body: x.children ?? [], tags, users }),
    };
  }, [content]);

  interface Node extends unist.Node<unist.Data> {
    value: string;
  }

  const disableMarkdownLinks = useCallback(
    () => (tree: Node) => {
      visit(tree, (node, index, parent) => {
        if (
          parent &&
          typeof index === "number" &&
          (node.type === "link" ||
            node.type === "linkReference" ||
            node.type === "image" ||
            node.type === "imageReference" ||
            node.type === "definition")
        ) {
          node.type = "text";
          const position = unwrap(node.position);
          node.value = content.slice(position.start.offset, position.end.offset).replace(/\)$/, " )");
          return SKIP;
        }
      });
    },
    [content]
  );
  return (
    <div dir="auto">
      <ReactMarkdown className="text" components={components} remarkPlugins={[disableMarkdownLinks]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
