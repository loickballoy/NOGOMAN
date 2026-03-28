'use client'
import { User, Job, Review } from './mock-data'

const STORAGE_KEYS = {
  USER: 'agrilink_user',
  JOBS: 'agrilink_jobs',
  REVIEWS: 'agrilink_reviews',
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEYS.USER)
  return raw ? JSON.parse(raw) : null
}

export function setUser(user: User) {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEYS.USER)
}

export function getJobs(): Job[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEYS.JOBS)
  return raw ? JSON.parse(raw) : []
}

export function saveJob(job: Job) {
  const jobs = getJobs()
  jobs.unshift(job)
  localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs))
}

export function getReviews(): Review[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEYS.REVIEWS)
  return raw ? JSON.parse(raw) : []
}

export function saveReview(review: Review) {
  const reviews = getReviews()
  reviews.unshift(review)
  localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(reviews))
}
