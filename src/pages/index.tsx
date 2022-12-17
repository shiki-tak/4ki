import type { InferGetStaticPropsType, NextPage } from "next";
import Head from "next/head";
import Layout from '../components/layout/Layout';

import styles from './articles.module.scss';
import { getAllPosts } from "../lib/api";
import { getAllPosts as getAllPostsQiita } from '../lib/qiita';
import { getAllPosts as getAllOtherPosts } from '../lib/others';

const Tag: React.FC<{ tag: string }> = ({ tag }) => {
  return <div className={styles.tag}>{tag}</div>;
};

type Props = InferGetStaticPropsType<typeof getStaticProps>;

export const getStaticProps = async () => {
  const allPosts = getAllPosts(["slug", "title", "date", "tags"]);
  const othersPost = getAllOtherPosts();
  const qiitaPosts = await getAllPostsQiita();

  const allList = [...allPosts, ...qiitaPosts, ...othersPost].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  
  return {
    props: { allPosts: allList },
  };
};

const Home: NextPage<Props> = ({ allPosts }) => {
  return (
    <Layout>
      <Head>
        <title>4ki&apos;s website</title>
        <meta name="description" content="website" />
      </Head>

      <div className={styles.grid}>
        {allPosts.map((post: any, i: number) => {
          if (post.label == 'qiita') {
            return (
              <a href={post.url} className={styles.card} key={i}>
                <h2>{post.title}</h2>
                <p>{post.date}</p>
                <ul>
                  {post.tags?.map((tag: any, i: number) => (
                    <Tag key={i} tag={tag} />
                  ))}
                </ul>
              </a>
            );
          } else if (post.label == 'others') {
            return (
              <a href={post.url} className={styles.card} key={i}>
                <h2>{post.title}</h2>
                <p>{post.date}</p>
                <ul>
                  {post.tags?.map((tag: any, i: number) => (
                    <Tag key={i} tag={tag} />
                  ))}
                </ul>
              </a>
            );
          } else {
            return (
              <a href={post.slug} className={styles.card} key={i}>
                <h2>{post.title}</h2>
                <p>{post.date}</p>
                <ul>
                  {post.tags?.map((tag: any, i: number) => (
                    <Tag key={i} tag={tag} />
                  ))}
                </ul>
              </a>
            );
          }
        })}
      </div>
    </Layout>
  );
};

export default Home;
