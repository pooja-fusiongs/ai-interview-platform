from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from models import PostHireFeedback, InterviewSession, QualityMetric, Recommendation

def compute_prediction_accuracy(db: Session):
    """Compare interview recommendation against actual post-hire performance.
    For feedback with session_id: check if recommendation matches performance.
    For feedback without session_id: use performance score thresholds directly."""
    feedbacks = db.query(PostHireFeedback).all()
    if not feedbacks:
        return {"accuracy": 0.0, "sample_size": 0}
    
    correct = 0
    total = 0

    for fb in feedbacks:
        if fb.session_id:
            session = db.query(InterviewSession).filter(InterviewSession.id == fb.session_id).first()
            if session and session.recommendation:
                total += 1
                if session.recommendation == Recommendation.SELECT and fb.overall_performance_score >= 7.0:
                    correct += 1
                elif session.recommendation == Recommendation.REJECT and fb.overall_performance_score < 5.0:
                    correct += 1
                elif session.recommendation == Recommendation.NEXT_ROUND and 5.0 <= fb.overall_performance_score < 7.0:
                    correct += 1
        else:
            # Without session, count as "accurate" if performance is good (>= 7.0)
            # since they were hired (implying a positive recommendation)
            total += 1
            if fb.overall_performance_score >= 7.0:
                correct += 1

    accuracy = correct / total if total > 0 else 0.0
    return {"accuracy": round(accuracy * 100, 2), "sample_size": total}

def compute_score_correlation(db: Session):
    """Pearson-like correlation between interview score and post-hire performance.
    Only works with feedback that has linked sessions with scores."""
    feedbacks = db.query(PostHireFeedback).filter(PostHireFeedback.session_id.isnot(None)).all()

    interview_scores = []
    performance_scores = []
    
    for fb in feedbacks:
        session = db.query(InterviewSession).filter(InterviewSession.id == fb.session_id).first()
        if session and session.overall_score is not None:
            interview_scores.append(session.overall_score)
            performance_scores.append(fb.overall_performance_score)
    
    n = len(interview_scores)
    if n < 2:
        return {"correlation": 0.0, "sample_size": n}
    
    mean_i = sum(interview_scores) / n
    mean_p = sum(performance_scores) / n
    
    numerator = sum((i - mean_i) * (p - mean_p) for i, p in zip(interview_scores, performance_scores))
    denom_i = sum((i - mean_i) ** 2 for i in interview_scores) ** 0.5
    denom_p = sum((p - mean_p) ** 2 for p in performance_scores) ** 0.5
    
    if denom_i == 0 or denom_p == 0:
        return {"correlation": 0.0, "sample_size": n}
    
    correlation = numerator / (denom_i * denom_p)
    return {"correlation": round(correlation, 4), "sample_size": n}

def compute_hire_success_rate(db: Session):
    """% of hired candidates with good performance (>= 7.0) or still employed."""
    total = db.query(PostHireFeedback).count()
    if total == 0:
        return {"success_rate": 0.0, "total": 0, "still_employed": 0}
    successful = db.query(PostHireFeedback).filter(
        (PostHireFeedback.overall_performance_score >= 7.0) | (PostHireFeedback.still_employed == True)
    ).count()
    still_employed = db.query(PostHireFeedback).filter(PostHireFeedback.still_employed == True).count()
    return {
        "success_rate": round((successful / total) * 100, 2),
        "total": total,
        "still_employed": still_employed,
    }

def compute_all_metrics(db: Session):
    """Run all metric computations and store in quality_metrics table."""
    results = []
    
    acc = compute_prediction_accuracy(db)
    metric = QualityMetric(
        metric_type="prediction_accuracy",
        metric_value=acc["accuracy"],
        sample_size=acc["sample_size"],
        computed_at=datetime.utcnow(),
    )
    db.add(metric)
    results.append(metric)
    
    corr = compute_score_correlation(db)
    metric = QualityMetric(
        metric_type="score_correlation",
        metric_value=corr["correlation"],
        sample_size=corr["sample_size"],
        computed_at=datetime.utcnow(),
    )
    db.add(metric)
    results.append(metric)
    
    success = compute_hire_success_rate(db)
    metric = QualityMetric(
        metric_type="hire_success_rate",
        metric_value=success["success_rate"],
        sample_size=success["total"],
        computed_at=datetime.utcnow(),
    )
    db.add(metric)
    results.append(metric)
    
    db.commit()
    return results

def _categorize_feedback(fb, db):
    """Categorize feedback into strong_hire/hire/no_hire based on session or performance."""
    if fb.session_id:
        session = db.query(InterviewSession).filter(InterviewSession.id == fb.session_id).first()
        if session and session.recommendation:
            if session.recommendation == Recommendation.SELECT:
                return "strong_hire"
            elif session.recommendation == Recommendation.NEXT_ROUND:
                return "hire"
            elif session.recommendation == Recommendation.REJECT:
                return "no_hire"
    # Fallback: categorize by performance score
    if fb.overall_performance_score >= 8.0:
        return "strong_hire"
    elif fb.overall_performance_score >= 5.0:
        return "hire"
    else:
        return "no_hire"

def get_dashboard_data(db: Session):
    """Compile all quality metrics into a dashboard response."""
    acc = compute_prediction_accuracy(db)
    corr = compute_score_correlation(db)
    success = compute_hire_success_rate(db)

    # Average performance by recommendation category
    all_feedbacks = db.query(PostHireFeedback).all()
    categories = {"strong_hire": [], "hire": [], "no_hire": []}

    for fb in all_feedbacks:
        cat = _categorize_feedback(fb, db)
        categories[cat].append(fb.overall_performance_score)

    avg_by_rec = {}
    for cat, scores in categories.items():
        if scores:
            avg_by_rec[cat] = {
                "count": len(scores),
                "avg_performance": round(sum(scores) / len(scores), 2),
            }
        else:
            avg_by_rec[cat] = {"count": 0, "avg_performance": 0.0}

    # Metrics over time
    metrics_over_time = []
    recent = db.query(QualityMetric).filter(
        QualityMetric.metric_type == "prediction_accuracy"
    ).order_by(QualityMetric.computed_at.desc()).limit(6).all()
    for m in reversed(recent):
        metrics_over_time.append({
            "date": m.computed_at.isoformat() if m.computed_at else "",
            "accuracy": m.metric_value,
            "sample_size": m.sample_size,
        })
    
    return {
        "prediction_accuracy": acc["accuracy"],
        "correlation": corr["correlation"],
        "total_hires_tracked": success["total"],
        "success_rate": success["success_rate"],
        "by_recommendation": avg_by_rec,
        "metrics_over_time": metrics_over_time,
    }
