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
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 40px 30px 40px; text-align: center;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Interview Scheduled</h1>
                                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">AI Interview Platform</p>
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                        Dear <strong style="color: #1f2937;">{candidate_name}</strong>,
                                    </p>
                                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                        We are pleased to inform you that your interview has been scheduled for the position of <strong style="color: #f59e0b;">{job_title}</strong>.
                                    </p>

                                    <!-- Interview Details Card -->
                                    <table role="presentation" style="width: 100%; background: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <h3 style="color: #92400e; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Interview Details</h3>
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; width: 40px; vertical-align: top;">📅</td>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 500;">Date</td>
                                                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">{interview_date}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; width: 40px; vertical-align: top;">⏰</td>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 500;">Time</td>
                                                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">{interview_time}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; width: 40px; vertical-align: top;">💼</td>
                                                        <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 500;">Position</td>
                                                        <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">{job_title}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    {f'''
                                    <!-- Meeting Link Button -->
                                    <table role="presentation" style="width: 100%; margin-top: 30px;">
                                        <tr>
                                            <td style="text-align: center;">
                                                <a href="{meeting_url}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);">
                                                    🎥 Join Interview Meeting
                                                </a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="text-align: center; padding-top: 12px;">
                                                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                                                    Or copy this link: <a href="{meeting_url}" style="color: #f59e0b; word-break: break-all;">{meeting_url}</a>
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    ''' if meeting_url else ''}

                                    <!-- Tips Section -->
                                    <table role="presentation" style="width: 100%; margin-top: 30px; background: #f9fafb; border-radius: 12px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <h4 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">📋 Preparation Tips</h4>
                                                <ul style="color: #6b7280; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                                    <li>Test your camera and microphone before the interview</li>
                                                    <li>Ensure you have a stable internet connection</li>
                                                    <li>Choose a quiet, well-lit location</li>
                                                    <li>Join the meeting 5 minutes early</li>
                                                    <li>Have your resume and notes ready</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
                                        We wish you the best of luck!
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="background: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
                                    <table role="presentation" style="width: 100%;">
                                        <tr>
                                            <td style="text-align: center;">
                                                <p style="color: #9ca3af; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">AI Interview Platform</p>
                                                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                                    Powered by intelligent recruitment technology
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <!-- Disclaimer -->
                        <table role="presentation" style="max-width: 600px; margin: 20px auto 0 auto;">
                            <tr>
                                <td style="text-align: center;">
                                    <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                                        This is an automated message. Please do not reply directly to this email.<br>
                                        If you have questions, please contact our support team.
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

