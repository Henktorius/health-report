import { useCallback, useEffect, useState } from 'react';

import {
  deleteConversation as deleteConversationStorage,
  listConversations,
  type ConversationSummary,
} from '@/lib/conversations';

export interface UseConversations {
  conversations: ConversationSummary[];
  isLoading: boolean;
  reload: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useConversations(): UseConversations {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listConversations();
      setConversations(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await deleteConversationStorage(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { conversations, isLoading, reload, remove };
}
