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
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 30px; border-radius: 10px;">
                <h2 style="color: #f59e0b;">Interview Scheduled!</h2>
                <p>Dear <strong>{candidate_name}</strong>,</p>
                <p>Your interview has been scheduled for the position of <strong>{job_title}</strong>.</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>📅 Date:</strong> {interview_date}</p>
                    <p><strong>⏰ Time:</strong> {interview_time}</p>
                    {f"<p><strong>🔗 Meeting Link:</strong> <a href={meeting_url}>{meeting_url}</a></p>" if meeting_url else ""}
                </div>
                
                <p>Please be prepared and join on time. Good luck!</p>
                
                <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
                    - AI Interview Platform Team
                </p>
            </div>
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

