import type { InferGetStaticPropsType, NextPage } from "next";
import Head from "next/head";
import Layout from '../components/layout/Layout';

import styles from './articles.module.scss';
import { getAllPosts } from "../lib/api";
import { getAllPosts as getAllPostsQiita } from '../lib/qiita';

const Tag: React.FC<{ tag: string }> = ({ tag }) => {
  return <div className={styles.tag}>{tag}</div>;
};

type Props = InferGetStaticPropsType<typeof getStaticProps>;

export const getStaticProps = async () => {
  const allPosts = getAllPosts(["slug", "title", "date", "tags"]);

  const qiitaPosts = await getAllPostsQiita();
  
  return {
    props: { allPosts: [...allPosts, ...qiitaPosts] },
  };
};

const Home: NextPage<Props> = ({ allPosts }) => {
  return (
    <Layout>
      <Head>
        <title>4ki&apos;s home</title>
        <meta name="description" content="home" />
      </Head>

      <div className={styles.grid}>
        {allPosts.map((post, i) => {
          if (post.label == 'qiita') {
            return (
              <a href={post.url} className={styles.card} key={i}>
                <h2>{post.title}</h2>
                <p>{post.date}</p>
                <ul>
                  {post.tags?.map((tag, i) => (
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
                  {post.tags?.map((tag, i) => (
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
