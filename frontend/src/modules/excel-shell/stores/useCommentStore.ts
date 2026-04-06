import { create } from 'zustand'
import { NexcelLogger } from '../services/logger'

export interface NexcelCommentReply {
  id: string
  text: string
  author: string
  createdAt: string
}

export interface NexcelComment {
  id: string
  cellRef: string   // "rowId:fieldId" | "row:rowId" | "col:fieldId"
  text: string
  author: string
  createdAt: string
  resolvedAt?: string
  replies: NexcelCommentReply[]
}

interface CommentState {
  comments: NexcelComment[]
  addComment: (cellRef: string, text: string, author?: string) => NexcelComment
  addReply: (commentId: string, text: string, author?: string) => void
  resolveComment: (commentId: string) => void
  deleteComment: (commentId: string) => void
  getCommentsForCell: (cellRef: string) => NexcelComment[]
  getOpenCommentsForCell: (cellRef: string) => NexcelComment[]
  getAllOpenComments: () => NexcelComment[]
  hasCellComment: (cellRef: string) => boolean
  reset: () => void
  persist: () => void
  load: () => void
}

const STORAGE_KEY = 'kasumi_nexcel_comments'

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],

  addComment: (cellRef, text, author = 'user') => {
    const comment: NexcelComment = {
      id: uuid(), cellRef, text, author,
      createdAt: new Date().toISOString(),
      replies: []
    }
    set(s => ({ comments: [...s.comments, comment] }))
    NexcelLogger.comments('info', 'addComment', { cellRef, id: comment.id })
    get().persist()
    return comment
  },

  addReply: (commentId, text, author = 'user') => {
    const reply: NexcelCommentReply = { id: uuid(), text, author, createdAt: new Date().toISOString() }
    set(s => ({
      comments: s.comments.map(c => c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)
    }))
    NexcelLogger.comments('info', 'addReply', { commentId })
    get().persist()
  },

  resolveComment: (commentId) => {
    set(s => ({
      comments: s.comments.map(c => c.id === commentId ? { ...c, resolvedAt: new Date().toISOString() } : c)
    }))
    NexcelLogger.comments('info', 'resolveComment', { commentId })
    get().persist()
  },

  deleteComment: (commentId) => {
    set(s => ({ comments: s.comments.filter(c => c.id !== commentId) }))
    NexcelLogger.comments('info', 'deleteComment', { commentId })
    get().persist()
  },

  getCommentsForCell: (cellRef) => get().comments.filter(c => c.cellRef === cellRef),
  getOpenCommentsForCell: (cellRef) => get().comments.filter(c => c.cellRef === cellRef && !c.resolvedAt),
  getAllOpenComments: () => get().comments.filter(c => !c.resolvedAt),
  hasCellComment: (cellRef) => get().comments.some(c => c.cellRef === cellRef && !c.resolvedAt),

  reset: () => {
    set({ comments: [] })
    get().persist()
  },

  persist: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().comments))
    } catch (e) {
      NexcelLogger.comments('error', 'persistFailed', { error: String(e) })
    }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) set({ comments: JSON.parse(raw) })
      NexcelLogger.comments('info', 'loaded', { count: get().comments.length })
    } catch (e) {
      NexcelLogger.comments('error', 'loadFailed', { error: String(e) })
    }
  }
}))
