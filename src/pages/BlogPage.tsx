import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Calendar, Clock, Scale, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import type { BlogPost } from "@/lib/blog-types";
import { absoluteUrl } from "@/lib/app-url";
import { usePublishedBlogPosts } from "@/hooks/use-blog-posts";

/* ── Blog Post Card ── */
function BlogPostCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-border/40 bg-card/70 p-6 hover:border-border/60 hover:shadow-md transition-all duration-300"
    >
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className="text-[10px] h-5 bg-foreground/[0.04]">{post.category}</Badge>
        <span className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(post.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <span className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {post.readTime}
        </span>
      </div>
      <h2 className="text-[17px] font-semibold mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
      <p className="text-[13px] text-muted-foreground/60 leading-relaxed mb-4">{post.description}</p>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/70 group-hover:text-primary transition-colors">
        Weiterlesen <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </motion.article>
  );
}

/* ── Blog Post Detail ── */
function BlogPostDetail({ post, allPosts }: { post: BlogPost; allPosts: BlogPost[] }) {
  const navigate = useNavigate();
  const related = allPosts.filter(p => p.slug !== post.slug).slice(0, 2);

  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Organization", name: "Legal AI" },
    publisher: { "@type": "Organization", name: "Legal AI", url: absoluteUrl("/") },
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    keywords: post.keywords.join(", "),
  });

  return (
    <>
      <SEOHead
        title={`${post.title} | Legal AI Blog`}
        description={post.description}
        keywords={post.keywords.join(", ")}
        canonical={absoluteUrl(`/blog/${post.slug}`)}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleSchema }} />

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-[12px] text-muted-foreground/50">
          <button onClick={() => navigate("/")} className="hover:text-foreground transition-colors">Home</button>
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => navigate("/blog")} className="hover:text-foreground transition-colors">Blog</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/70 truncate max-w-[200px]">{post.title}</span>
        </nav>

        <Button variant="ghost" size="sm" className="mb-8 -ml-2 text-muted-foreground/50 hover:text-foreground" onClick={() => navigate("/blog")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Zurück zum Blog
        </Button>

        <div className="flex items-center gap-2 mb-4">
          <Badge variant="secondary" className="text-[10px] h-5">{post.category}</Badge>
          <span className="text-[12px] text-muted-foreground/50">
            {new Date(post.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          <span className="text-[12px] text-muted-foreground/50">· {post.readTime} Lesezeit</span>
        </div>

        <h1 className="text-[28px] sm:text-[36px] font-bold leading-tight mb-6">{post.title}</h1>
        <p className="text-[16px] text-muted-foreground/70 leading-relaxed mb-10 border-l-2 border-primary/20 pl-4">{post.description}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-semibold prose-h2:text-[22px] prose-h2:mt-10 prose-h2:mb-4
          prose-h3:text-[17px] prose-h3:mt-8 prose-h3:mb-3 prose-h4:text-[15px]
          prose-p:text-[14.5px] prose-p:leading-[1.8] prose-p:text-foreground/80
          prose-li:text-[14px] prose-li:leading-[1.7]
          prose-strong:text-foreground prose-strong:font-semibold
          prose-table:text-[13px]
          prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium
          prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border/30">
          {post.content.split("\n").map((line, i) => {
            if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>;
            if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>;
            if (line.startsWith("#### ")) return <h4 key={i}>{line.slice(5)}</h4>;
            if (line.startsWith("- ")) return <li key={i}>{line.slice(2)}</li>;
            if (line.startsWith("| ")) {
              const cells = line.split("|").filter(Boolean).map(c => c.trim());
              return <div key={i} className="flex gap-4 py-1 text-[13px]">{cells.map((c, j) => <span key={j} className="flex-1">{c}</span>)}</div>;
            }
            if (line.trim() === "") return <br key={i} />;
            return <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 rounded-2xl bg-foreground/[0.03] border border-border/40 text-center">
          <Scale className="h-8 w-8 text-foreground/30 mx-auto mb-4" />
          <h3 className="text-[18px] font-semibold mb-2">Legal AI kostenlos testen</h3>
          <p className="text-[13px] text-muted-foreground/60 mb-5 max-w-md mx-auto">
            Erleben Sie KI-gestützte Rechtsrecherche in österreichischen Rechtsdatenbanken. Kostenlos starten, keine Kreditkarte erforderlich.
          </p>
          <Button onClick={() => navigate("/auth")} className="rounded-xl h-10 px-6">
            Kostenlos starten <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <h3 className="text-[16px] font-semibold mb-4">Weitere Artikel</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {related.map(p => (
                <button
                  key={p.slug}
                  onClick={() => navigate(`/blog/${p.slug}`)}
                  className="text-left rounded-xl border border-border/30 p-4 hover:border-border/50 hover:bg-muted/20 transition-all"
                >
                  <Badge variant="secondary" className="text-[9px] h-4 mb-2">{p.category}</Badge>
                  <h4 className="text-[14px] font-medium mb-1">{p.title}</h4>
                  <p className="text-[12px] text-muted-foreground/50 line-clamp-2">{p.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}

/* ── Blog Index ── */
export default function BlogPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { data: dbPosts, isLoading } = usePublishedBlogPosts();

  const allPosts = dbPosts ?? [];

  if (slug) {
    const post = allPosts.find(p => p.slug === slug);
    if (!post && !isLoading) { navigate("/blog"); return null; }
    if (!post) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse h-40 w-40" /></div>;
    return <BlogPostDetail post={post} allPosts={allPosts} />;
  }

  return (
    <>
      <SEOHead
        title="Legal AI Blog | KI für Anwälte – Ratgeber & Praxistipps"
        description="Expertenwissen zu Legal AI, Rechtsrecherche mit KI, automatisierter Vertragsprüfung und DSGVO-konformer KI-Nutzung in Kanzleien."
        keywords="Legal AI Blog, KI für Anwälte, Rechtsrecherche KI, Vertragsprüfung automatisieren, Legal Tech Österreich"
        canonical={absoluteUrl("/blog")}
      />
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/30 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <Scale className="h-5 w-5" />
              <span className="font-semibold text-[15px]">Legal AI</span>
            </button>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/blog")} className="text-[13px]">Blog</Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/pricing")} className="text-[13px]">Preise</Button>
              <Button size="sm" onClick={() => navigate("/auth")} className="rounded-xl h-8 text-[12px]">Kostenlos starten</Button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-[32px] sm:text-[42px] font-bold tracking-tight mb-3">Legal AI Blog</h1>
            <p className="text-[16px] text-muted-foreground/60 max-w-2xl mb-12">
              Expertenwissen zu KI für Anwälte, automatisierter Rechtsrecherche und Legal Tech in Österreich.
            </p>
          </motion.div>

          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {allPosts.map(post => (
                <BlogPostCard key={post.slug} post={post} onClick={() => navigate(`/blog/${post.slug}`)} />
              ))}
            </div>
          )}
        </main>

        <footer className="border-t border-border/30 py-8 text-center text-[12px] text-muted-foreground/40">
          <div className="max-w-5xl mx-auto px-4 flex flex-wrap items-center justify-center gap-4">
            <span>© 2026 Legal AI</span>
            <button onClick={() => navigate("/datenschutz")} className="hover:text-foreground transition-colors">Datenschutz</button>
            <button onClick={() => navigate("/impressum")} className="hover:text-foreground transition-colors">Impressum</button>
            <button onClick={() => navigate("/agb")} className="hover:text-foreground transition-colors">AGB</button>
          </div>
        </footer>
      </div>
    </>
  );
}
