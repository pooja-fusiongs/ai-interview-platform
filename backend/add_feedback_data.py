#!/usr/bin/env python3
"""
Quick script to add dummy post-hire feedback data
"""

import sys
import os
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import PostHireFeedback, User, Job, InterviewSession, FeedbackStatus

def add_dummy_feedback():
    db: Session = SessionLocal()
    
    try:
        # Get existing users, jobs, and sessions
        users = db.query(User).limit(5).all()
        jobs = db.query(Job).limit(3).all()
        sessions = db.query(InterviewSession).limit(2).all()
        
        if not users or not jobs:
            print("❌ Need at least 1 user and 1 job in database")
            return
        
        # Check if feedback already exists
        existing = db.query(PostHireFeedback).first()
        if existing:
            print(f"✅ Feedback already exists (ID: {existing.id})")
            return
        
        # Create dummy feedback
        feedback = PostHireFeedback(
            candidate_id=users[0].id,
            job_id=jobs[0].id,
            session_id=sessions[0].id if sessions else None,
            submitted_by=users[-1].id,  # Different user as submitter
            hire_date=datetime.now() - timedelta(days=90),
            overall_performance_score=8.5,
            technical_competence_score=8.0,
            cultural_fit_score=9.0,
            communication_score=8.5,
            initiative_score=7.5,
            strengths_observed="Excellent problem-solving skills and team collaboration",
            areas_for_improvement="Could improve time management and documentation",
            comments="Great hire! Exceeded expectations in first quarter.",
            still_employed=True,
            would_rehire=True,
            status=FeedbackStatus.SUBMITTED
        )
        
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
        
        print(f"✅ Created feedback ID: {feedback.id}")
        print(f"   Candidate: {users[0].email}")
        print(f"   Job: {jobs[0].title}")
        print(f"   Score: {feedback.overall_performance_score}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_dummy_feedback()