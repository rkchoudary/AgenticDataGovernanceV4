import { useState, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Paperclip,
  X,
  User,
  Edit,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface Comment {
  id: string
  author: string
  authorEmail: string
  content: string
  mentions: string[]
  attachments: Attachment[]
  createdAt: string
  updatedAt?: string
  isEdited: boolean
}

export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  url: string
}

interface IssueCommentsProps {
  issueId: string
  comments: Comment[]
  onAddComment: (content: string, mentions: string[], attachments: File[]) => void
  onEditComment?: (commentId: string, content: string) => void
  onDeleteComment?: (commentId: string) => void
  availableUsers: { id: string; name: string; email: string }[]
}

export function IssueComments({
  issueId: _issueId,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  availableUsers,
}: IssueCommentsProps) {
  const [newComment, setNewComment] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [attachments, setAttachments] = useState<File[]>([])
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  const filteredUsers = availableUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
      user.email.toLowerCase().includes(mentionSearch.toLowerCase())
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPosition = e.target.selectionStart || 0
    setNewComment(value)

    // Check for @ mentions
    const textBeforeCursor = value.slice(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      // Check if there's no space after @ (still typing mention)
      if (!textAfterAt.includes(' ')) {
        setShowMentions(true)
        setMentionSearch(textAfterAt)
        setMentionPosition(lastAtIndex)
      } else {
        setShowMentions(false)
      }
    } else {
      setShowMentions(false)
    }
  }

  const handleMentionSelect = (user: { id: string; name: string; email: string }) => {
    const beforeMention = newComment.slice(0, mentionPosition)
    const afterMention = newComment.slice(mentionPosition + mentionSearch.length + 1)
    const newValue = `${beforeMention}@${user.name} ${afterMention}`
    setNewComment(newValue)
    setShowMentions(false)
    textareaRef.current?.focus()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments((prev) => [...prev, ...files])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!newComment.trim() && attachments.length === 0) return

    // Extract mentions from content
    const mentionRegex = /@(\w+\s\w+)/g
    const mentions: string[] = []
    let mentionMatch: RegExpExecArray | null
    while ((mentionMatch = mentionRegex.exec(newComment)) !== null) {
      const matchedName = mentionMatch[1]
      const user = availableUsers.find((u) => u.name === matchedName)
      if (user) mentions.push(user.id)
    }

    onAddComment(newComment, mentions, attachments)
    setNewComment('')
    setAttachments([])
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }


  const renderContent = (content: string) => {
    // Highlight @mentions
    const parts = content.split(/(@\w+\s\w+)/g)
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="text-primary font-medium">
            {part}
          </span>
        )
      }
      return part
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comments List */}
        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{comment.author}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                      {comment.isEdited && (
                        <span className="text-xs text-muted-foreground">(edited)</span>
                      )}
                    </div>
                    {(onEditComment || onDeleteComment) && (
                      <div className="flex items-center gap-1">
                        {onEditComment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingCommentId(comment.id)
                              setEditContent(comment.content)
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                        {onDeleteComment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => onDeleteComment(comment.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {editingCommentId === comment.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2 border rounded-md bg-background resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            onEditComment?.(comment.id, editContent)
                            setEditingCommentId(null)
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCommentId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">
                      {renderContent(comment.content)}
                    </p>
                  )}
                  {/* Attachments */}
                  {comment.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {comment.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm hover:bg-muted/80 transition-colors"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span>{attachment.name}</span>
                          <span className="text-muted-foreground">
                            ({formatFileSize(attachment.size)})
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>


        {/* New Comment Form */}
        <div className="border-t pt-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={handleInputChange}
              placeholder="Add a comment... Use @ to mention someone"
              className="w-full p-3 border rounded-md bg-background resize-none min-h-[100px]"
              rows={3}
            />
            
            {/* Mentions Dropdown */}
            {showMentions && filteredUsers.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1 w-64 bg-background border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2"
                    onClick={() => handleMentionSelect(user)}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <span className="text-muted-foreground">
                    ({formatFileSize(file.size)})
                  </span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center justify-between">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Attach
              </Button>
            </div>
            <Button onClick={handleSubmit} disabled={!newComment.trim() && attachments.length === 0}>
              <Send className="h-4 w-4 mr-2" />
              Comment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default IssueComments
