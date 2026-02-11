import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content

def send_interview_notification(candidate_email: str, candidate_name: str, job_title: str, interview_date: str, interview_time: str, meeting_url: str = None):
    """Send interview scheduled notification to candidate"""
    # Read env vars at runtime (after dotenv is loaded)
    SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
    SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@ai-interview-platform.com")

    print(f"📧 Email service - API Key exists: {bool(SENDGRID_API_KEY)}")
    print(f"📧 Email service - Sender: {SENDER_EMAIL}")
    print(f"📧 Email service - Recipient: {candidate_email}")

    if not SENDGRID_API_KEY:
        print("⚠️ SENDGRID_API_KEY not set, skipping email")
        return False
    
    try:
        subject = f"Interview Scheduled: {job_title}"
        
        # Build CTA button HTML only if meeting_url is provided
        cta_html = ""
        if meeting_url:
            cta_html = f'''
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;">
                                <tr>
                                    <td align="center">
                                        <a href="{meeting_url}"
                                           style="background:#020291; color:#ffffff; text-decoration:none;
                                                  padding:12px 28px; font-size:14px; font-weight:600;
                                                  border-radius:4px; display:inline-block;">
                                            Join Interview
                                        </a>
                                    </td>
                                </tr>
                            </table>
            '''

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Interview Scheduled</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr>
            <td align="center">

                <!-- Card -->
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; border:1px solid #e5e7eb;">

                    <!-- Body -->
                    <tr>
                        <td style="padding:40px 40px 35px 40px;">

                            <!-- Header -->
                            <h2 style="margin:0 0 25px 0; color:#020291; font-size:24px; font-weight:700;">
                                Interview Scheduled!
                            </h2>

                            <p style="margin:0 0 12px 0; color:#374151; font-size:15px;">
                                Dear <strong>{candidate_name}</strong>,
                            </p>

                            <p style="margin:0 0 25px 0; color:#374151; font-size:15px;">
                                Your interview has been scheduled for the position of
                                <strong>{job_title}</strong>.
                            </p>

                            <!-- Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
                                <tr>
                                    <td style="padding:20px 25px;">
                                        <table width="100%">
                                            <tr>
                                                <td style="font-size:14px; color:#374151; padding:8px 0;">
                                                    📅 <strong>Date:</strong> <span style="color:#111827; font-weight:600;">{interview_date}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="font-size:14px; color:#374151; padding:8px 0;">
                                                    ⏰ <strong>Time:</strong> <span style="color:#111827; font-weight:600;">{interview_time}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA -->
                            {cta_html}

                            <p style="margin:25px 0 0 0; font-size:14px; color:#374151;">
                                Please be prepared and join on time. Good luck!
                            </p>

                            <p style="margin:20px 0 0 0; font-size:14px; color:#6b7280;">
                                - <strong>AI Interview Platform Team</strong>
                            </p>
                        </td>
                    </tr>

                </table>

                <!-- Footer -->
                <table width="560" cellpadding="0" cellspacing="0" style="margin-top:15px;">
                    <tr>
                        <td align="center" style="font-size:12px; color:#9ca3af;">
                            This is an automated message. Please do not reply.
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>
</body>
</html>
        """
        
        message = Mail(
            from_email=Email(SENDER_EMAIL, "AI Interview Platform"),
            to_emails=To(candidate_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        
        print(f"✅ Email sent to {candidate_email}, status: {response.status_code}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        print(f"❌ Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return False


def send_expert_review_request(expert_email: str, expert_name: str, job_title: str, candidate_name: str, question_count: int):
    """Notify domain expert that new questions need review."""
    SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
    SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@ai-interview-platform.com")

    if not SENDGRID_API_KEY:
        print("[Email] SENDGRID_API_KEY not set, skipping expert review notification")
        return False

    try:
        subject = f"Questions Ready for Review: {job_title}"
        html_content = f"""
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:8px; border:1px solid #e5e7eb;">
                <tr><td style="padding:40px;">
                    <h2 style="margin:0 0 20px; color:#020291; font-size:22px;">Questions Need Your Review</h2>
                    <p style="color:#374151; font-size:15px;">Dear <strong>{expert_name}</strong>,</p>
                    <p style="color:#374151; font-size:15px;">{question_count} AI-generated questions for <strong>{candidate_name}</strong> (position: <strong>{job_title}</strong>) are ready for your expert review.</p>
                    <table width="100%" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; margin:20px 0;">
                        <tr><td style="padding:15px 20px; font-size:14px; color:#374151;">
                            <strong>Position:</strong> {job_title}<br>
                            <strong>Candidate:</strong> {candidate_name}<br>
                            <strong>Questions:</strong> {question_count}
                        </td></tr>
                    </table>
                    <p style="color:#374151; font-size:14px;">Please log in to the platform to review and approve these questions.</p>
                    <p style="color:#6b7280; font-size:14px; margin-top:20px;">- <strong>AI Interview Platform Team</strong></p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>"""

        message = Mail(
            from_email=Email(SENDER_EMAIL, "AI Interview Platform"),
            to_emails=To(expert_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"[Email] Expert review request sent to {expert_email}, status: {response.status_code}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send expert review request: {e}")
        return False


def send_review_completed_notification(recruiter_email: str, recruiter_name: str, job_title: str, candidate_name: str, approved_count: int, total_count: int):
    """Notify recruiter that expert has completed reviewing all questions."""
    SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
    SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@ai-interview-platform.com")

    if not SENDGRID_API_KEY:
        print("[Email] SENDGRID_API_KEY not set, skipping review completed notification")
        return False

    try:
        subject = f"Expert Review Completed: {job_title}"
        html_content = f"""
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:8px; border:1px solid #e5e7eb;">
                <tr><td style="padding:40px;">
                    <h2 style="margin:0 0 20px; color:#10b981; font-size:22px;">Expert Review Completed</h2>
                    <p style="color:#374151; font-size:15px;">Dear <strong>{recruiter_name}</strong>,</p>
                    <p style="color:#374151; font-size:15px;">The expert review for <strong>{candidate_name}</strong> (position: <strong>{job_title}</strong>) has been completed.</p>
                    <table width="100%" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; margin:20px 0;">
                        <tr><td style="padding:15px 20px; font-size:14px; color:#374151;">
                            <strong>Approved:</strong> {approved_count} / {total_count} questions<br>
                            <strong>Status:</strong> Review Complete
                        </td></tr>
                    </table>
                    <p style="color:#374151; font-size:14px;">You can now proceed with scheduling the interview.</p>
                    <p style="color:#6b7280; font-size:14px; margin-top:20px;">- <strong>AI Interview Platform Team</strong></p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>"""

        message = Mail(
            from_email=Email(SENDER_EMAIL, "AI Interview Platform"),
            to_emails=To(recruiter_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        print(f"[Email] Review completed notification sent to {recruiter_email}, status: {response.status_code}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send review completed notification: {e}")
        return False

