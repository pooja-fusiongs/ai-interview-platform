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
                <table width="560" cellpadding="0" cellspacing="0" style="background:#80808042; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">

                    <!-- Header -->
                    <tr>
                        <td style="padding:30px 30px 20px 30px; text-align:center;">
                            <h2 style="margin:0; color:#f59e0b; font-size:22px; font-weight:700;">
                                Interview Scheduled!
                            </h2>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:0 30px 30px 30px;">
                            <p style="margin:0 0 15px 0; color:#374151; font-size:15px;">
                                Dear <strong>{candidate_name}</strong>,
                            </p>

                            <p style="margin:0 0 25px 0; color:#374151; font-size:15px;">
                                Your interview has been scheduled for the position of
                                <strong>{job_title}</strong>.
                            </p>

                            <!-- Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:4px;">
                                <tr>
                                    <td style="padding:18px;">
                                        <table width="100%">
                                            <tr>
                                                <td style="font-size:14px; color:#6b7280; padding:6px 0;">
                                                    📅 <strong>Date:</strong>
                                                </td>
                                                <td style="font-size:14px; color:#111827; font-weight:600; padding:6px 0;">
                                                    {interview_date}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="font-size:14px; color:#6b7280; padding:6px 0;">
                                                    ⏰ <strong>Time:</strong>
                                                </td>
                                                <td style="font-size:14px; color:#111827; font-weight:600; padding:6px 0;">
                                                    {interview_time}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA -->
                            {f'''
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;">
                                <tr>
                                    <td align="center">
                                        <a href="{meeting_url}"
                                           style="background:#f59e0b; color:#ffffff; text-decoration:none;
                                                  padding:12px 28px; font-size:14px; font-weight:600;
                                                  border-radius:4px; display:inline-block;">
                                            Join Interview
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            ''' if meeting_url else ''}

                            <p style="margin:25px 0 0 0; font-size:14px; color:#374151;">
                                Please be prepared and join on time. Good luck!
                            </p>

                            <p style="margin:20px 0 0 0; font-size:14px; color:#374151;">
                                — <strong>AI Interview Platform Team</strong>
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

