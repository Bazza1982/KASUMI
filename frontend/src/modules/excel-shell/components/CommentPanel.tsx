import React, { useState } from 'react'
import { useCommentStore, NexcelComment } from '../stores/useCommentStore'
import { NexcelLogger } from '../services/logger'

interface CommentPanelProps {
  isOpen: boolean
  onClose: () => void
}

function CommentGroup({ cellRef, comments }: { cellRef: string; comments: NexcelComment[] }) {
  const { addReply, resolveComment } = useCommentStore()
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const submitReply = (commentId: string) => {
    if (!replyText.trim()) return
    addReply(commentId, replyText.trim())
    setReplyText('')
    setReplyingTo(null)
  }

  return (
    <div style={{ marginBottom: 16, borderBottom: '1px solid #e1dfdd', paddingBottom: 12 }}>
      <div style={{
        fontSize: 11,
        color: '#888',
        marginBottom: 6,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {cellRef}
      </div>
      {comments.map(comment => (
        <div key={comment.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{comment.author}</span>
            <span style={{ fontSize: 10, color: '#aaa' }}>
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#222', margin: '0 0 6px 0', lineHeight: 1.4 }}>{comment.text}</p>
          {comment.replies.length > 0 && (
            <div style={{ marginLeft: 12, borderLeft: '2px solid #e1dfdd', paddingLeft: 8 }}>
              {comment.replies.map(reply => (
                <div key={reply.id} style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{reply.author}: </span>
                  <span style={{ fontSize: 12, color: '#333' }}>{reply.text}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              style={{
                background: 'none', border: '1px solid #d0d0d0', borderRadius: 3,
                padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#555',
              }}
            >
              Reply
            </button>
            <button
              onClick={() => resolveComment(comment.id)}
              style={{
                background: 'none', border: '1px solid #d0d0d0', borderRadius: 3,
                padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#217346',
              }}
            >
              Resolve
            </button>
          </div>
          {replyingTo === comment.id && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
              <input
                autoFocus
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitReply(comment.id)}
                placeholder="Write a reply..."
                style={{
                  flex: 1, fontSize: 12, padding: '3px 6px',
                  border: '1px solid #ccc', borderRadius: 3, outline: 'none',
                }}
              />
              <button
                onClick={() => submitReply(comment.id)}
                style={{
                  background: '#217346', color: 'white', border: 'none',
                  borderRadius: 3, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                Send
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const CommentPanel: React.FC<CommentPanelProps> = ({ isOpen, onClose }) => {
  const { getAllOpenComments } = useCommentStore()
  const openComments = getAllOpenComments()

  // Group by cellRef
  const grouped: Record<string, NexcelComment[]> = {}
  for (const comment of openComments) {
    if (!grouped[comment.cellRef]) grouped[comment.cellRef] = []
    grouped[comment.cellRef].push(comment)
  }

  NexcelLogger.comments('debug', 'CommentPanel render', { isOpen, count: openComments.length })

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        backgroundColor: 'white',
        borderLeft: '1px solid #e1dfdd',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
        zIndex: 3000,
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e1dfdd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f3f2f1',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Comments ({openComments.length})</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#666', lineHeight: 1, padding: '0 2px',
          }}
          title="Close"
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            No open comments
          </div>
        ) : (
          Object.entries(grouped).map(([cellRef, comments]) => (
            <CommentGroup key={cellRef} cellRef={cellRef} comments={comments} />
          ))
        )}
      </div>
    </div>
  )
}

export default CommentPanel
