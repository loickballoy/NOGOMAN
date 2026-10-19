import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from './api';
import {
  ChatMessage, Conversation, Engagement, FundingQuote, Job, JobApplication, MyApplication, Payment, PayoutHistory, SelfUser,
} from './types';

export const keys = {
  jobsNear: (lat: number, lng: number) => ['jobs', 'near', lat.toFixed(3), lng.toFixed(3)] as const,
  myJobs: ['jobs', 'mine'] as const,
  job: (id: string) => ['job', id] as const,
  applications: (jobId: string) => ['applications', jobId] as const,
  myApplications: ['applications', 'mine'] as const,
  engagements: ['engagements'] as const,
  engagement: (id: string) => ['engagement', id] as const,
  quote: (jobId: string) => ['quote', jobId] as const,
  payment: (id: string) => ['payment', id] as const,
  payouts: ['payouts'] as const,
  conversations: ['conversations'] as const,
  unread: ['conversations', 'unread'] as const,
  messages: (id: string) => ['messages', id] as const,
};

// Chat polls: simple and robust on patchy rural networks. A socket can replace it later.
export const useConversations = () =>
  useQuery({ queryKey: keys.conversations, queryFn: () => api<Conversation[]>('/conversations'), refetchInterval: 10_000 });
export const useUnread = () =>
  useQuery({ queryKey: keys.unread, queryFn: () => api<{ count: number }>('/conversations/unread'), refetchInterval: 15_000 });
export const useMessages = (id: string) =>
  useQuery({ queryKey: keys.messages(id), queryFn: () => api<ChatMessage[]>(`/conversations/${id}/messages`), refetchInterval: 4_000 });

export const openConversation = (applicationId: string) =>
  api<{ id: string }>(`/applications/${applicationId}/conversation`, { method: 'POST' });

/** Opens (creating if needed) the chat for an application and navigates to it. */
export function useOpenChat() {
  return useMutation({
    mutationFn: openConversation,
    onSuccess: (c) => router.push(`/chat/${c.id}`),
  });
}

/** Open jobs nearest first. `radiusKm` null = the whole country (people travel for farm work). */
export const useJobsNear = (lat: number | undefined, lng: number | undefined, radiusKm: number | null, limit: number) =>
  useQuery({
    queryKey: [...keys.jobsNear(lat ?? 0, lng ?? 0), radiusKm ?? 'all', limit],
    queryFn: () => api<Job[]>(`/jobs?lat=${lat}&lng=${lng}&limit=${limit}${radiusKm ? `&radiusKm=${radiusKm}` : ''}`),
    enabled: lat !== undefined && lng !== undefined,
    placeholderData: (previous) => previous,
  });

export const useMyJobs = () => useQuery({ queryKey: keys.myJobs, queryFn: () => api<Job[]>('/jobs/mine') });
export const useJob = (id: string) => useQuery({ queryKey: keys.job(id), queryFn: () => api<Job>(`/jobs/${id}`) });
export const useApplications = (jobId: string, enabled: boolean) =>
  useQuery({ queryKey: keys.applications(jobId), queryFn: () => api<JobApplication[]>(`/jobs/${jobId}/applications`), enabled });
export const useMyApplications = (enabled = true) =>
  useQuery({ queryKey: keys.myApplications, queryFn: () => api<MyApplication[]>('/applications/mine'), enabled });
export const useEngagements = () => useQuery({ queryKey: keys.engagements, queryFn: () => api<Engagement[]>('/engagements/mine') });
export const useEngagement = (id: string) =>
  useQuery({ queryKey: keys.engagement(id), queryFn: () => api<Engagement>(`/engagements/${id}`) });
export const useQuote = (jobId: string) =>
  useQuery({ queryKey: keys.quote(jobId), queryFn: () => api<FundingQuote>(`/jobs/${jobId}/funding/quote`) });
export const usePayouts = () => useQuery({ queryKey: keys.payouts, queryFn: () => api<PayoutHistory>('/me/payouts') });

/** Polls a pending payment until the provider settles it. */
export const usePayment = (id?: string) =>
  useQuery({
    queryKey: keys.payment(id ?? ''),
    queryFn: () => api<Payment>(`/payments/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 3000 : false),
  });

/** Any write: runs it, then refreshes everything job- and money-related. */
export function useApiMutation<TVars = void, TRes = unknown>(fn: (vars: TVars) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of ['jobs', 'job', 'applications', 'engagements', 'engagement', 'quote', 'payouts']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

export const useDeleteAccount = () => useMutation({ mutationFn: () => api<void>('/me', { method: 'DELETE' }) });

export const useUpdateMe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Record<string, unknown>>) => api<SelfUser>('/me', { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.payouts }),
  });
};
