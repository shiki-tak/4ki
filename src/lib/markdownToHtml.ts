import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import { remark } from 'remark';
import html from 'remark-html';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import remarkToc from 'remark-toc';
import remarkSlug from 'remark-slug';
import math from 'remark-math';
import htmlKatex from 'remark-html-katex';

/**
 * Markdown を解析して HTML にして返す
 * @param markdown Markdown ファイル名
 * @returns HTML
 */
const markdownToHtml = async (markdown: string) => {
  const result = await unified()
    .use(html)
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSlug)
    .use(math)
    .use(htmlKatex)
    .use(remarkToc, { heading: '目次', tight: true, prefix: '', maxDepth: 2 })
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(markdown);
  return result.value.toString();
};

export default markdownToHtml;
