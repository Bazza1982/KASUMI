// ============================================================
// KASUMI WORDO — Comment Panel (sidebar)
// Shows all comments for the current document.
// ============================================================

import React, { useState } from 'react'
import { useCommentStore, Comment } from '../stores/useCommentStore'

interface CommentPanelProps {
  /** Current user's name for replies */
  currentUser?: string
}

export function CommentPanel({ currentUser = 'user' }: CommentPanelProps) {
  const { getAllComments, addReply, resolveComment, reopenComment, deleteComment } = useCommentStore()
  const comments = getAllComments()
  const open = comments.filter(c => c.status === 'open')
  const resolved = comments.filter(c => c.status === 'resolved')

  return (
    <div className="wordo-comment-panel">
      <div className="wordo-comment-panel__header">
        <span>Comments</span>
        <span className="wordo-comment-panel__count">{open.length} open</span>
      </div>

      {open.length === 0 && resolved.length === 0 && (
        <div className="wordo-comment-panel__empty">No comments yet. Select text and click Add Comment.</div>
      )}

      {open.map(c => (
        <CommentBubble
          key={c.id}
          comment={c}
          currentUser={currentUser}
          onReply={(text) => addReply(c.id, currentUser, text)}
          onResolve={() => resolveComment(c.id)}
          onDelete={() => deleteComment(c.id)}
        />
      ))}

      {resolved.length > 0 && (
        <details className="wordo-comment-panel__resolved-section">
          <summary>{resolved.length} resolved</summary>
          {resolved.map(c => (
            <CommentBubble
              key={c.id}
              comment={c}
              currentUser={currentUser}
              onReply={(text) => addReply(c.id, currentUser, text)}
              onReopen={() => reopenComment(c.id)}
              onDelete={() => deleteComment(c.id)}
            />
          ))}
        </details>
      )}
    </div>
  )
}

interface CommentBubbleProps {
  comment: Comment
  currentUser: string
  onReply: (text: string) => void
  onResolve?: () => void
  onReopen?: () => void
  onDelete: () => void
}

function CommentBubble({ comment, currentUser, onReply, onResolve, onReopen, onDelete }: CommentBubbleProps) {
  const [replyText, setReplyText] = useState('')
  const [showReply, setShowReply] = useState(false)
  const isResolved = comment.status === 'resolved'

  function submitReply() {
    const text = replyText.trim()
    if (!text) return
    onReply(text)
    setReplyText('')
    setShowReply(false)
  }

  return (
    <div className={`wordo-comment-bubble ${isResolved ? 'wordo-comment-bubble--resolved' : ''}`}>
      <div className="wordo-comment-bubble__anchor-text">"{comment.anchorText.slice(0, 60)}{comment.anchorText.length > 60 ? '…' : ''}"</div>

      <div className="wordo-comment-bubble__main">
        <div className="wordo-comment-bubble__author">{comment.author}</div>
        <div className="wordo-comment-bubble__text">{comment.text}</div>
        <div className="wordo-comment-bubble__time">{formatTime(comment.createdAt)}</div>
      </div>

      {comment.replies.map(r => (
        <div key={r.id} className="wordo-comment-bubble__reply">
          <span className="wordo-comment-bubble__author">{r.author}:</span>
          <span className="wordo-comment-bubble__text"> {r.text}</span>
          <div className="wordo-comment-bubble__time">{formatTime(r.createdAt)}</div>
        </div>
      ))}

      <div className="wordo-comment-bubble__actions">
        {!isResolved && (
          <>
            <button onClick={() => setShowReply(v => !v)}>Reply</button>
            {onResolve && <button onClick={onResolve}>Resolve</button>}
          </>
        )}
        {isResolved && onReopen && <button onClick={onReopen}>Reopen</button>}
        <button className="wordo-comment-bubble__delete" onClick={onDelete}>Delete</button>
      </div>

      {showReply && (
        <div className="wordo-comment-bubble__reply-input">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitReply() }}
          />
          <button onClick={submitReply}>Send</button>
          <button onClick={() => setShowReply(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
