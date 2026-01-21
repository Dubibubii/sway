import { useToast as useBaseToast } from './use-toast';
import { useCallback, createElement, useRef } from 'react';
import { ToastAction, ToastActionElement } from '@/components/ui/toast';

export async function sendQuickErrorFeedback(errorMessage: string, context?: string): Promise<boolean> {
  try {
    const fullMessage = context 
      ? `[Error Report] ${context}: ${errorMessage}`
      : `[Error Report] ${errorMessage}`;
    
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        feedback: fullMessage,
        userWallet: null,
        isErrorReport: true
      }),
    });
    
    return response.ok;
  } catch (err) {
    console.error('[ErrorFeedback] Failed to send:', err);
    return false;
  }
}

export function useErrorToast() {
  const { toast } = useBaseToast();
  const reportedErrorsRef = useRef<Set<string>>(new Set());
  
  const showErrorWithReport = useCallback((
    title: string,
    description: string,
    context?: string
  ) => {
    const errorKey = `${title}-${description}-${Date.now()}`;
    
    const action = createElement(ToastAction, {
      altText: 'Report this error',
      onClick: async () => {
        if (reportedErrorsRef.current.has(errorKey)) return;
        reportedErrorsRef.current.add(errorKey);
        
        const success = await sendQuickErrorFeedback(description, context || title);
        toast({
          title: success ? 'Error Reported' : 'Report Failed',
          description: success ? 'Thanks for helping us improve!' : 'Could not send report. Please try again.',
        });
      },
      className: 'bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-2',
    }, 'Report') as unknown as ToastActionElement;
    
    toast({
      title,
      description,
      variant: 'destructive',
      action,
    });
  }, [toast]);

  return { showErrorWithReport, toast };
}
