import { useEffect } from "react";

function upsertMeta(attr, key, content) {
  if (!content) return;
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function SeoHead({ title, description, ogTitle, ogDescription, ogType = "website" }) {
  useEffect(() => {
    if (title) document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", ogTitle || title);
    upsertMeta("property", "og:description", ogDescription || description);
    upsertMeta("property", "og:type", ogType);
  }, [title, description, ogTitle, ogDescription, ogType]);

  return null;
}
