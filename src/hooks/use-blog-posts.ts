import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPost } from "@/lib/blog-types";

export interface DbBlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  read_time: string;
  category: string;
  keywords: string[];
  content: string;
  published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toFrontend(p: DbBlogPost): BlogPost {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    readTime: p.read_time,
    category: p.category,
    keywords: p.keywords ?? [],
    content: p.content,
  };
}

/** Public: fetches published posts (no auth required) */
export function usePublishedBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts-published"],
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("published", true)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as unknown as DbBlogPost[]).map(toFrontend);
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Admin: fetches all posts */
export function useAllBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts-all"],
    queryFn: async (): Promise<DbBlogPost[]> => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as unknown as DbBlogPost[];
    },
    staleTime: 1000 * 60,
  });
}
