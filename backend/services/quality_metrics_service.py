from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from models import PostHireFeedback, InterviewSession, QualityMetric, Recommendation

def compute_prediction_accuracy(db: Session):
    """Compare interview recommendation against actual post-hire performance.
    Accuracy = % of 'select' candidates with perf >= 7.0 + % of 'reject' never hired."""
    feedbacks = db.query(PostHireFeedback).join(
        InterviewSession, PostHireFeedback.session_id == InterviewSession.id
    ).all()
    
    if not feedbacks:
        return {"accuracy": 0.0, "sample_size": 0}
    
    correct = 0
    total = len(feedbacks)
    
    for fb in feedbacks:
        session = db.query(InterviewSession).filter(InterviewSession.id == fb.session_id).first()
        if not session:
            continue
        if session.recommendation == Recommendation.SELECT and fb.overall_performance_score >= 7.0:
            correct += 1
        elif session.recommendation == Recommendation.REJECT and fb.overall_performance_score < 5.0:
            correct += 1
        elif session.recommendation == Recommendation.NEXT_ROUND and 5.0 <= fb.overall_performance_score < 7.0:
            correct += 1
    
    accuracy = correct / total if total > 0 else 0.0
    return {"accuracy": round(accuracy, 4), "sample_size": total}

def compute_score_correlation(db: Session):
    """Pearson-like correlation between interview score and post-hire performance."""
    feedbacks = db.query(PostHireFeedback).filter(PostHireFeedback.session_id.isnot(None)).all()
    
    if len(feedbacks) < 2:
        return {"correlation": 0.0, "sample_size": len(feedbacks)}
    
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
    """% of hired candidates still employed."""
    total = db.query(PostHireFeedback).count()
    if total == 0:
        return {"success_rate": 0.0, "total": 0, "still_employed": 0}
    still_employed = db.query(PostHireFeedback).filter(PostHireFeedback.still_employed == True).count()
    return {
        "success_rate": round(still_employed / total, 4),
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

def get_dashboard_data(db: Session):
    """Compile all quality metrics into a dashboard response."""
    acc = compute_prediction_accuracy(db)
    corr = compute_score_correlation(db)
    success = compute_hire_success_rate(db)
    
    # Average performance by recommendation
    avg_by_rec = {}
    for rec in [Recommendation.SELECT, Recommendation.NEXT_ROUND, Recommendation.REJECT]:
        feedbacks = db.query(PostHireFeedback).join(
            InterviewSession, PostHireFeedback.session_id == InterviewSession.id
        ).filter(InterviewSession.recommendation == rec).all()
        if feedbacks:
            avg_by_rec[rec.value] = round(
                sum(f.overall_performance_score for f in feedbacks) / len(feedbacks), 2
            )
        else:
            avg_by_rec[rec.value] = 0.0
    
    # Metrics over time (last 6 months placeholder)
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
        "overall_prediction_accuracy": acc["accuracy"],
        "score_performance_correlation": corr["correlation"],
        "total_hires_tracked": success["total"],
        "hire_success_rate": success["success_rate"],
        "average_performance_by_recommendation": avg_by_rec,
        "metrics_over_time": metrics_over_time,
    }
