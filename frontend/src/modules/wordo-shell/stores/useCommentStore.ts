// ============================================================
// KASUMI WORDO — Comment Store
// Stores all comments and replies for the current document.
// Comments are separate from PM state — they reference text
// ranges via comment_ref marks in the editor.
// ============================================================

import { create } from 'zustand'
import { createLogger } from '../editor/logger'

const log = createLogger('Comment')

export interface CommentReply {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface Comment {
  id: string
  sectionId: string
  /** Block ID where the comment_ref mark lives */
  anchorBlockId: string
  /** The text the comment is anchored to (snapshot at comment creation) */
  anchorText: string
  author: string
  text: string
  createdAt: string
  status: 'open' | 'resolved'
  replies: CommentReply[]
}

function generateCommentId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'cmt_' + crypto.randomUUID().slice(0, 8)
  }
  return 'cmt_' + Date.now().toString(36)
}

function generateReplyId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'rpl_' + crypto.randomUUID().slice(0, 8)
  }
  return 'rpl_' + Date.now().toString(36)
}

interface CommentState {
  comments: Map<string, Comment>

  addComment(params: {
    sectionId: string
    anchorBlockId: string
    anchorText: string
    author: string
    text: string
  }): string   // returns commentId

  addReply(commentId: string, author: string, text: string): void

  resolveComment(commentId: string): void
  reopenComment(commentId: string): void
  deleteComment(commentId: string): void

  getCommentsForBlock(blockId: string): Comment[]
  getAllComments(): Comment[]
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: new Map(),

  addComment({ sectionId, anchorBlockId, anchorText, author, text }) {
    const id = generateCommentId()
    const comment: Comment = {
      id,
      sectionId,
      anchorBlockId,
      anchorText,
      author,
      text,
      createdAt: new Date().toISOString(),
      status: 'open',
      replies: [],
    }
    set(state => {
      const next = new Map(state.comments)
      next.set(id, comment)
      return { comments: next }
    })
    log.info('comment-added', { commentId: id, sectionId, anchorBlockId, author, anchorText: anchorText.slice(0, 40) })
    return id
  },

  addReply(commentId, author, text) {
    const comment = get().comments.get(commentId)
    if (!comment) {
      log.warn('reply-target-not-found', { commentId })
      return
    }
    const reply: CommentReply = {
      id: generateReplyId(),
      author,
      text,
      createdAt: new Date().toISOString(),
    }
    set(state => {
      const next = new Map(state.comments)
      const updated = { ...comment, replies: [...comment.replies, reply] }
      next.set(commentId, updated)
      return { comments: next }
    })
    log.info('reply-added', { commentId, replyId: reply.id, author })
  },

  resolveComment(commentId) {
    const comment = get().comments.get(commentId)
    if (!comment) {
      log.warn('resolve-target-not-found', { commentId })
      return
    }
    set(state => {
      const next = new Map(state.comments)
      next.set(commentId, { ...comment, status: 'resolved' })
      return { comments: next }
    })
    log.info('comment-resolved', { commentId })
  },

  reopenComment(commentId) {
    const comment = get().comments.get(commentId)
    if (!comment) {
      log.warn('reopen-target-not-found', { commentId })
      return
    }
    set(state => {
      const next = new Map(state.comments)
      next.set(commentId, { ...comment, status: 'open' })
      return { comments: next }
    })
    log.info('comment-reopened', { commentId })
  },

  deleteComment(commentId) {
    if (!get().comments.has(commentId)) {
      log.warn('delete-target-not-found', { commentId })
      return
    }
    set(state => {
      const next = new Map(state.comments)
      next.delete(commentId)
      return { comments: next }
    })
    log.info('comment-deleted', { commentId })
  },

  getCommentsForBlock(blockId) {
    return Array.from(get().comments.values()).filter(c => c.anchorBlockId === blockId)
  },

  getAllComments() {
    return Array.from(get().comments.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
}))
