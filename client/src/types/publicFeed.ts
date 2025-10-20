/**
 * Типы для публичной ленты капсул
 */

export interface PublicCapsule {
  id: number;
  name: string;
  description?: string;
  thumbnailUrl: string | null;
  canvasData: any;
  analysis?: any;
  createdAt: string;
  likesCount: number;
  isLiked: boolean;
  itemCount: number;
  items: any[];
  author: {
    firstName: string;
    lastName: string;
    username?: string;
  };
}

export interface PublicFeedPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}

export interface PublicFeedResponse {
  success: boolean;
  capsules: PublicCapsule[];
  pagination: PublicFeedPagination;
  error?: string;
}
