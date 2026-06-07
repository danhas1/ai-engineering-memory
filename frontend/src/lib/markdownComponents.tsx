import type { Components } from 'react-markdown'

// Light-mode typography — optimized for reading AI-generated answers on white.
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-[18px] font-semibold tracking-tight text-gray-900 mt-7 mb-3 first:mt-0 leading-snug">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[16px] font-semibold tracking-tight text-gray-900 mt-6 mb-2.5 first:mt-0 leading-snug">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[14px] font-semibold text-gray-900 mt-4 mb-2 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[14px] text-gray-700 leading-[1.75] mb-3.5 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="pl-5 mb-3.5 space-y-1.5 list-disc marker:text-gray-300">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="pl-5 mb-3.5 space-y-1.5 list-decimal marker:text-gray-400">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-[14px] text-gray-700 leading-[1.7] pl-0.5">
      {children}
    </li>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className?.includes('language-'))
    if (isBlock) {
      return (
        <code className="font-mono text-[12.5px] text-gray-700 leading-relaxed">
          {children}
        </code>
      )
    }
    return (
      <code className="font-mono text-[12.5px] bg-gray-100 px-1.5 py-0.5 rounded-md text-blue-700 border border-gray-200">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-gray-950 border border-gray-800 rounded-xl px-5 py-4 overflow-x-auto my-4 text-[12.5px] leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-200 pl-4 py-0.5 my-4 text-[14px] text-gray-500 leading-relaxed italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline decoration-blue-200 underline-offset-3 hover:decoration-blue-500 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-600">{children}</em>
  ),
  hr: () => <hr className="border-gray-100 my-6" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-gray-100">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-50 border-b border-gray-100">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold text-gray-600 px-4 py-2.5 text-[11px] uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-gray-700 border-b border-gray-50 last:border-b-0 align-top">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="odd:bg-transparent even:bg-gray-50/50">{children}</tr>
  ),
}
