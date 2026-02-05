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
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 30px 0;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e0e0e0;">

                            <!-- Header -->
                            <tr>
                                <td style="background-color: #f59e0b; padding: 25px; text-align: center;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">Interview Scheduled</h1>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding: 30px;">
                                    <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                                        Dear {candidate_name},
                                    </p>

                                    <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                        Your interview has been scheduled for the position of <strong>{job_title}</strong>.
                                    </p>

                                    <!-- Details Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e5e5e5; margin-bottom: 25px;">
                                        <tr>
                                            <td style="padding: 20px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 100px;">Date:</td>
                                                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">{interview_date}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Time:</td>
                                                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">{interview_time}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Position:</td>
                                                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">{job_title}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    {f'''
                                    <p style="text-align: center; margin: 25px 0;">
                                        <a href="{meeting_url}" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; padding: 12px 30px; font-size: 14px; font-weight: 600;">Join Meeting</a>
                                    </p>
                                    ''' if meeting_url else ''}

                                    <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 20px 0 0 0;">
                                        Please be prepared and join on time.
                                    </p>

                                    <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 20px 0 0 0;">
                                        Best regards,<br>
                                        <strong>AI Interview Platform Team</strong>
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                                    <p style="color: #999999; font-size: 12px; margin: 0;">
                                        This is an automated message from AI Interview Platform.
                                    </p>
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

