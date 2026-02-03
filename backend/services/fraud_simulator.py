"""
Fraud Detection Simulator Service.

Generates realistic simulated biometric fraud-detection scores for
video interviews, including voice consistency, lip-sync analysis,
body movement analysis, and aggregated trust scoring with flags.
"""

import random
import json
from datetime import datetime


def simulate_voice_analysis(video_interview_id):
    """Generate simulated voice consistency metrics."""
    score = round(random.uniform(0.65, 0.99), 3)
    details = {
        "pitch_variation": round(random.uniform(0.05, 0.25), 3),
        "speaking_rate_consistency": round(random.uniform(0.7, 0.98), 3),
        "voice_print_match": round(random.uniform(0.6, 0.99), 3),
        "samples_analyzed": random.randint(50, 200),
    }
    return {"score": score, "details": details}


def simulate_lip_sync_analysis(video_interview_id):
    """Generate simulated lip-sync analysis."""
    score = round(random.uniform(0.6, 0.99), 3)
    details = {
        "avg_sync_offset_ms": round(random.uniform(10, 150), 1),
        "confidence_frames_pct": round(random.uniform(0.7, 0.98), 3),
        "anomaly_windows": random.randint(0, 5),
        "total_frames_analyzed": random.randint(5000, 20000),
    }
    return {"score": score, "details": details}


def simulate_body_movement_analysis(video_interview_id):
    """Generate simulated body/movement analysis."""
    score = round(random.uniform(0.65, 0.99), 3)
    details = {
        "posture_consistency": round(random.uniform(0.6, 0.98), 3),
        "eye_contact_pct": round(random.uniform(0.4, 0.9), 3),
        "head_movement_variance": round(random.uniform(0.02, 0.2), 3),
        "suspicious_gestures_count": random.randint(0, 3),
    }
    return {"score": score, "details": details}


def generate_fraud_flags(voice_score, lip_score, body_score):
    """Based on scores, generate realistic flag objects."""
    flags = []
    if voice_score < 0.75:
        flags.append({
            "flag_type": "voice_inconsistency",
            "severity": "high" if voice_score < 0.65 else "medium",
            "timestamp_seconds": round(random.uniform(60, 1800), 1),
            "description": "Voice pattern shift detected - possible speaker change",
            "confidence": round(1.0 - voice_score, 3),
        })
    if lip_score < 0.75:
        flags.append({
            "flag_type": "lip_sync_mismatch",
            "severity": "high" if lip_score < 0.65 else "medium",
            "timestamp_seconds": round(random.uniform(120, 2400), 1),
            "description": "Lip movement does not match audio stream",
            "confidence": round(1.0 - lip_score, 3),
        })
    if body_score < 0.75:
        flags.append({
            "flag_type": "unusual_movement",
            "severity": "medium" if body_score >= 0.65 else "high",
            "timestamp_seconds": round(random.uniform(180, 3000), 1),
            "description": "Unusual body movement or frequent off-screen glances",
            "confidence": round(1.0 - body_score, 3),
        })
    # Random low-severity flags
    if random.random() < 0.3:
        flags.append({
            "flag_type": "possible_proxy",
            "severity": "low",
            "timestamp_seconds": round(random.uniform(300, 2000), 1),
            "description": "Brief audio delay pattern detected",
            "confidence": round(random.uniform(0.1, 0.3), 3),
        })
    return flags


def run_full_simulated_analysis(video_interview_id):
    """Run all simulated analyses and return aggregated result."""
    voice = simulate_voice_analysis(video_interview_id)
    lip = simulate_lip_sync_analysis(video_interview_id)
    body = simulate_body_movement_analysis(video_interview_id)
    flags = generate_fraud_flags(voice["score"], lip["score"], body["score"])

    # Weighted average
    overall_trust = round(
        voice["score"] * 0.35 + lip["score"] * 0.35 + body["score"] * 0.30, 3
    )

    return {
        "voice_consistency_score": voice["score"],
        "voice_consistency_details": json.dumps(voice["details"]),
        "lip_sync_score": lip["score"],
        "lip_sync_details": json.dumps(lip["details"]),
        "body_movement_score": body["score"],
        "body_movement_details": json.dumps(body["details"]),
        "overall_trust_score": overall_trust,
        "flags": json.dumps(flags),
        "flag_count": len(flags),
        "analyzed_at": datetime.utcnow(),
    }
