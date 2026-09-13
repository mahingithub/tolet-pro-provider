import React, { useCallback, useEffect, useState } from 'react';
import { Star, MessageSquare, ArrowLeft, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useLang } from '../context/LanguageContext.jsx';
import { listReviews, replyToReview } from '../services/providerService.js';
import { Button, Card, Badge, inputClass } from '../components/ui/index.js';
import LoadingState from '../components/common/LoadingState.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorState from '../components/common/ErrorState.jsx';

/**
 * Reviews — reading them, and answering them.
 * ──────────────────────────────────────────────────────────────────────────
 * NOT a sixth tab. The shell's rule is five tabs and a sixth needs an argument,
 * and this does not have one: reviews arrive in ones and twos, not daily like
 * orders or খাতা. It is reached from আয় instead, where "how am I doing" already
 * lives.
 *
 * ─── THE REPLY IS THE POINT ──────────────────────────────────────────────────
 * A calm answer to a bad review does more for a small shop than the review
 * costs it — a customer reading "দুঃখিত, সেদিন বৃষ্টি ছিল" learns more about
 * the shop than the two stars above it. So the default view is UNANSWERED, the
 * reply box is open on the card rather than behind a tap, and the lowest
 * ratings are the ones he is shown first.
 *
 * He can rewrite his own reply forever and can never touch the review itself.
 * That asymmetry is enforced by the server, not by this screen.
 */

function Stars({ n }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={15}
          className={i <= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
        />
      ))}
    </span>
  );
}

function ReviewCard({ review, onReply, busy }) {
  const { t, bn } = useLang();
  const answered = Boolean(review.reply?.at);
  const [draft, setDraft] = useState(review.reply?.text || '');
  const [editing, setEditing] = useState(!answered);

  const when = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {
      day: 'numeric', month: 'short',
    })
    : '';

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Stars n={review.rating} />
          <p className="text-sm font-bold text-gray-900 mt-1.5 truncate">
            {review.reviewerName || t('একজন ক্রেতা', 'A customer')}
          </p>
          <p className="text-xs text-gray-500">{when}</p>
        </div>
        {/* `order` means a completed order stands behind this opinion;
            `contact` means a recorded call, which is the only evidence a
            contact-tier category can ever produce. */}
        <Badge tone={review.basis === 'order' ? 'success' : 'neutral'}>
          {review.basis === 'order'
            ? t('অর্ডার করেছিলেন', 'Ordered')
            : t('ফোন করেছিলেন', 'Called')}
        </Badge>
      </div>

      {review.comment ? (
        <p className="text-sm text-gray-800 bg-gray-50 rounded-xl px-3.5 py-3 leading-relaxed">
          {review.comment}
        </p>
      ) : null}

      {answered && !editing ? (
        <div className="border-l-2 border-[#ba0036] pl-3 space-y-1.5">
          <p className="text-xs font-bold text-[#ba0036]">{t('আপনার উত্তর', 'Your reply')}</p>
          <p className="text-sm text-gray-700">{review.reply.text}</p>
          <button
            type="button"
            className="text-xs font-bold text-gray-500 underline"
            onClick={() => setEditing(true)}
          >
            {t('বদলান', 'Edit')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Open on the card, not behind a tap. A reply box he has to go
              looking for is a reply box nobody uses. */}
          <textarea
            className={`${inputClass} min-h-[88px] resize-none`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={600}
            placeholder={review.rating <= 3
              ? t('শান্তভাবে উত্তর দিন — অন্য ক্রেতারাও এটি পড়বেন।',
                'Answer calmly — other customers read this too.')
              : t('ধন্যবাদ জানান', 'Say thank you')}
          />
          <div className="flex gap-2">
            {answered ? (
              <Button
                size="sm" variant="ghost"
                onClick={() => { setDraft(review.reply.text); setEditing(false); }}
              >
                {t('বাতিল', 'Cancel')}
              </Button>
            ) : null}
            <Button
              size="sm" variant="primary" icon={Send} fullWidth={!answered}
              loading={busy}
              disabled={!draft.trim()}
              onClick={() => onReply(review, draft.trim())}
            >
              {t('উত্তর দিন', 'Reply')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

const Reviews = () => {
  const { t } = useLang();
  const [unansweredOnly, setUnansweredOnly] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReviews({ unanswered: unansweredOnly });
      // Worst first. The ones that need an answer are the ones that hurt, and
      // burying them under five-star rows is how they go unanswered.
      const rows = [...(data.reviews || [])].sort((a, b) => a.rating - b.rating);
      setReviews(rows);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [unansweredOnly]);

  useEffect(() => { load(); }, [load]);

  const handleReply = async (review, text) => {
    setBusyId(review.id);
    try {
      await replyToReview(review.id, text);
      toast.success(t('উত্তর দেওয়া হয়েছে', 'Reply posted'));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/earnings" className="shrink-0">
          <Button size="sm" variant="ghost" icon={ArrowLeft}>
            {t('আয়', 'Earnings')}
          </Button>
        </Link>
        <div className="flex gap-2 ml-auto">
          {[
            { key: true, bn: 'উত্তর বাকি', en: 'To answer' },
            { key: false, bn: 'সব', en: 'All' },
          ].map((f) => (
            <button
              key={String(f.key)}
              type="button"
              onClick={() => setUnansweredOnly(f.key)}
              className={[
                'px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap border transition',
                unansweredOnly === f.key
                  ? 'bg-[#ba0036] text-white border-transparent'
                  : 'bg-white text-gray-600 border-gray-200',
              ].join(' ')}
            >
              {t(f.bn, f.en)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error.message} onRetry={load} /> : null}

      {!loading && !error && !reviews.length ? (
        <EmptyState
          icon={MessageSquare}
          title={unansweredOnly
            ? t('সব উত্তর দেওয়া হয়ে গেছে', 'Everything is answered')
            : t('এখনো কোনো রিভিউ নেই', 'No reviews yet')}
          hint={unansweredOnly
            ? t('নতুন রিভিউ এলে এখানে দেখাবে।', 'New reviews will appear here.')
            : t('অর্ডার সম্পন্ন হলে ক্রেতারা রিভিউ দিতে পারেন।',
              'Customers can review once an order is completed.')}
        />
      ) : null}

      {!loading && !error && reviews.length ? (
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              busy={busyId === r.id}
              onReply={handleReply}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default Reviews;
// Shared with আয়, which shows the rating alongside the other numbers.
export { Stars };
