type User = any;

type Tag = {
  name: string;
  versions: any[];
};

type Res = {
  rendered_body: string;
  coediting: boolean;
  comments_count: number;
  created_at: string;
  group: null;
  id: string;
  likes_count: 133;
  private: boolean;
  reactions_count: 0;
  tags: Tag[];
  title: string;
  updated_at: string;
  url: string;
  user: User;
  page_views_count: null;
  team_membership: null;
};

export const getAllPosts = async () => {
  const url = 'https://qiita.com/api/v2/items?page=1&per_page=100&query=user:shiki_tak';
  const res = await fetch(url);
  const data = await res.json();

  return data.map((post: Res) => ({
    title: post.title,
    url: post.url,
    tags: post.tags.map((tag) => tag.name),
    label: 'qiita',
    date: post.created_at,
  }));
};
