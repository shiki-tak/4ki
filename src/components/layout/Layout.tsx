import Link from 'next/link';
import styles from './Layout.module.scss';

const WEB_SITE_NAME = "4ki's website";

const Layout: React.FC<{ children: any }> = ({ children }) => {
  return (
    <div className={styles.root}>
      <meta name="theme-color" content="white" />
      <header className={styles.header}>
        <div className={styles.headerContainer}>
          <Link href="/">
            <h1>{WEB_SITE_NAME}</h1>
          </Link>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>        
        <a>@shiki_tak</a>
      </footer>
    </div>
  );
};

export default Layout;
