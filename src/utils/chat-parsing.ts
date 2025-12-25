/**
 * Chat message parsing utilities
 * Extracted from MessageBubble component for testing
 */

export type ContentPartType = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'action'; label: string; action: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'download-link'; text: string; url: string }

/**
 * Parse chat message content and extract different content types
 * including download links, regular links, code blocks, etc.
 * 
 * @param content - The raw message content to parse
 * @returns Array of parsed content parts
 */
export function parseContent(content: string): ContentPartType[] {
  const parts: ContentPartType[] = []
  let remaining = content

  while (remaining.length > 0) {
    // Check for code blocks
    const codeBlockMatch = remaining.match(/^```(\w*)\n([\s\S]*?)```/)
    if (codeBlockMatch) {
      parts.push({
        type: 'code',
        language: codeBlockMatch[1] || 'text',
        content: codeBlockMatch[2],
      })
      remaining = remaining.slice(codeBlockMatch[0].length)
      continue
    }

    // Check for download links in backticks format FIRST (before inline code)
    const backtickDownloadMatch = remaining.match(/`(\/api\/download\/[^`]+)`/)
    if (backtickDownloadMatch && backtickDownloadMatch.index !== undefined) {
      const url = backtickDownloadMatch[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the backtick URL
      const beforeUrl = remaining.slice(0, backtickDownloadMatch.index)
      const afterUrl = remaining.slice(backtickDownloadMatch.index + backtickDownloadMatch[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
      continue
    }

    // Check for inline code (after backtick download check)
    const inlineCodeMatch = remaining.match(/^`([^`]+)`/)
    if (inlineCodeMatch) {
      parts.push({ type: 'inline-code', content: inlineCodeMatch[1] })
      remaining = remaining.slice(inlineCodeMatch[0].length)
      continue
    }

    // Check for action buttons [Action Label](action:action_name)
    const actionMatch = remaining.match(/^\[([^\]]+)\]\(action:([^)]+)\)/)
    if (actionMatch) {
      parts.push({ type: 'action', label: actionMatch[1], action: actionMatch[2] })
      remaining = remaining.slice(actionMatch[0].length)
      continue
    }

    // Check for download links - enhanced to detect /api/download/ URLs (anywhere in text)
    // Look for markdown download links first
    const downloadLinkMatch = remaining.match(/\[([^\]]+)\]\((\/api\/download\/[^)]+)\)/)
    if (downloadLinkMatch && downloadLinkMatch.index !== undefined) {
      const beforeLink = remaining.slice(0, downloadLinkMatch.index)
      const afterLink = remaining.slice(downloadLinkMatch.index + downloadLinkMatch[0].length)
      
      // Add text before link if any
      if (beforeLink) {
        parts.push({ type: 'text', content: beforeLink })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: downloadLinkMatch[1], 
        url: downloadLinkMatch[2] 
      })
      
      // Continue with remaining text
      remaining = afterLink
      continue
    }

    // Check for regular links [text](url) (anywhere in text)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch && !linkMatch[2].startsWith('action:') && !linkMatch[2].includes('/api/download/') && linkMatch.index !== undefined) {
      const beforeLink = remaining.slice(0, linkMatch.index)
      const afterLink = remaining.slice(linkMatch.index + linkMatch[0].length)
      
      // Add text before link if any
      if (beforeLink) {
        parts.push({ type: 'text', content: beforeLink })
      }
      
      // Add regular link
      parts.push({ type: 'link', text: linkMatch[1], url: linkMatch[2] })
      
      // Continue with remaining text
      remaining = afterLink
      continue
    }

    // Check for bare download URLs in text (only match URLs that start with /api/download/ and not preceded by protocol)
    // Look for /api/download/ URLs that are not part of a longer URL with protocol
    const bareDownloadMatch = remaining.match(/(^|\s)(\/api\/download\/[^\s\n,)]+)(?=\s|$|[,\n)])/)
    if (bareDownloadMatch && bareDownloadMatch.index !== undefined) {
      // Check if this URL is preceded by http:// or https:// in the original content
      const fullTextBeforeMatch = content.slice(0, content.indexOf(remaining) + bareDownloadMatch.index)
      const isAfterProtocol = /https?:\/\/[^\s]*$/.test(fullTextBeforeMatch)
      
      if (!isAfterProtocol) {
        const url = bareDownloadMatch[2]
        const filename = url.split('/').pop() || 'Download File'
        
        // Split the text before and after the URL
        const beforeUrl = remaining.slice(0, bareDownloadMatch.index + bareDownloadMatch[1].length)
        const afterUrl = remaining.slice(bareDownloadMatch.index + bareDownloadMatch[0].length)
        
        // Add text before URL if any
        if (beforeUrl) {
          parts.push({ type: 'text', content: beforeUrl })
        }
        
        // Add download link
        parts.push({ 
          type: 'download-link', 
          text: filename, 
          url: url 
        })
        
        // Continue with remaining text
        remaining = afterUrl
        continue
      }
    }

    // Check for tables
    const tableMatch = remaining.match(/^(\|[^\n]+\|\n)+/)
    if (tableMatch) {
      const tableContent = tableMatch[0]
      const lines = tableContent.trim().split('\n')
      if (lines.length >= 2) {
        const headers = lines[0].split('|').filter(Boolean).map(h => h.trim())
        const rows = lines.slice(2).map(line => 
          line.split('|').filter(Boolean).map(cell => cell.trim())
        )
        parts.push({ type: 'table', headers, rows })
        remaining = remaining.slice(tableMatch[0].length)
        continue
      }
    }

    // Regular text - look for next special pattern
    const nextSpecial = remaining.search(/```|`|\[|^\|/)
    if (nextSpecial === -1) {
      // No more special patterns, add all remaining text
      if (remaining.length > 0) {
        parts.push({ type: 'text', content: remaining })
      }
      break
    } else if (nextSpecial === 0) {
      // Special pattern at start but not matched above, consume one character
      parts.push({ type: 'text', content: remaining.slice(0, 1) })
      remaining = remaining.slice(1)
    } else {
      // Add text before next special pattern
      parts.push({ type: 'text', content: remaining.slice(0, nextSpecial) })
      remaining = remaining.slice(nextSpecial)
    }
  }

  // Merge consecutive text parts
  const merged: ContentPartType[] = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (part.type === 'text' && last?.type === 'text') {
      last.content += part.content
    } else {
      merged.push(part)
    }
  }

  return merged
}

/**
 * Extract all download links from parsed content
 * @param parts - Parsed content parts
 * @returns Array of download link parts
 */
export function extractDownloadLinks(parts: ContentPartType[]): Array<{ text: string; url: string }> {
  return parts
    .filter((part): part is { type: 'download-link'; text: string; url: string } => 
      part.type === 'download-link'
    )
    .map(part => ({ text: part.text, url: part.url }))
}

/**
 * Check if content contains any download URLs
 * @param content - Raw message content
 * @returns True if download URLs are detected
 */
export function hasDownloadUrls(content: string): boolean {
  const parts = parseContent(content)
  return parts.some(part => part.type === 'download-link')
}

/**
 * Count the number of download links in content
 * @param content - Raw message content
 * @returns Number of download links found
 */
export function countDownloadLinks(content: string): number {
  const parts = parseContent(content)
  return parts.filter(part => part.type === 'download-link').length
}