import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import nodemailer from 'nodemailer';
import Groq from 'groq-sdk';

const app = express();
const upload = multer({ dest: 'uploads/' });

// CORS
app.use(
  cors()
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// --- AI client ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildPrompt({ transcript, customInstruction }) {
  return `You are an assistant that produces structured summaries from meeting or call transcripts.\n\n` +
    `Transcript:\n${transcript}\n\n` +
    `Instruction from user: ${customInstruction}\n\n` +
    `Requirements:\n` +
    `- Be concise and well structured.\n` +
    `- Use markdown headings and bullet points when appropriate.\n` +
    `- If action items exist, list them with owners and due dates if available.\n` +
    `- If risks or open questions exist, include them.\n` +
    `- Never fabricate details not present in the transcript.\n`;
}

// Function to convert markdown to HTML
function markdownToHtml(markdown) {
  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3 style="color: #2c3e50; margin-top: 20px; margin-bottom: 15px; font-size: 1.3rem;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color: #2c3e50; margin-top: 25px; margin-bottom: 15px; font-size: 1.5rem; border-bottom: 2px solid #3498db; padding-bottom: 6px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color: #2c3e50; margin-top: 30px; margin-bottom: 15px; font-size: 1.8rem; border-bottom: 3px solid #3498db; padding-bottom: 8px;">$1</h1>')
    
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #2c3e50; font-weight: 700;">$1</strong>')
    
    // Bullet points
    .replace(/^- (.*$)/gim, '<li style="margin-bottom: 8px; line-height: 1.6;">$1</li>')
    .replace(/(<li.*<\/li>)/s, '<ul style="margin: 15px 0; padding-left: 25px;">$1</ul>')
    
    // Tables - Simple conversion for markdown tables
    .replace(/^\|(.+)\|$/gim, (match, content) => {
      const cells = content.split('|').map(cell => cell.trim());
      const isHeader = cells.some(cell => cell.includes('---'));
      
      if (isHeader) {
        return ''; // Skip separator rows
      }
      
      // Check if this is likely a header row (first table row or contains bold text)
      const isHeaderRow = cells.some(cell => cell.includes('**')) || match.includes('Owner') || match.includes('Task');
      
      const cellTags = cells.map(cell => {
        const cleanCell = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (isHeaderRow) {
          return `<th style="background-color: #3498db; color: white; padding: 12px 15px; text-align: left; font-weight: 600;">${cleanCell}</th>`;
        } else {
          return `<td style="padding: 12px 15px; border-bottom: 1px solid #e9ecef;">${cleanCell}</td>`;
        }
      }).join('');
      
      return `<tr>${cellTags}</tr>`;
    })
    
    // Wrap table rows in table tags
    .replace(/(<tr>.*<\/tr>)/s, '<table style="width: 100%; border-collapse: collapse; margin: 15px 0; background-color: white; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">$1</table>')
    
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin-bottom: 15px; line-height: 1.6;">')
    .replace(/\n/g, '<br/>');
}

// Function to create HTML email template
function createHtmlEmail(content, subject) {
  const htmlContent = markdownToHtml(content);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .email-container {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .email-header {
            border-bottom: 3px solid #3498db;
            margin-bottom: 25px;
            padding-bottom: 15px;
        }
        .email-header h1 {
            color: #2c3e50;
            margin: 0;
            font-size: 1.8rem;
        }
        .email-content p {
            margin-bottom: 15px;
            line-height: 1.6;
        }
        .email-footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e9ecef;
            color: #666;
            font-size: 0.9rem;
        }
        table tr:nth-child(even) td {
            background-color: #f8f9fa;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>${subject}</h1>
        </div>
        <div class="email-content">
            <p style="margin-bottom: 15px; line-height: 1.6;">${htmlContent}</p>
        </div>
        <div class="email-footer">
            <p>This summary was generated by AI Meeting Notes Summarizer</p>
        </div>
    </div>
</body>
</html>`;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// --- Summarize endpoint ---
// Accepts either JSON { transcript, prompt } OR multipart/form-data with fields:
// - file: a .txt file (plain text)
// - transcript: optional text textarea
// - prompt: custom instruction
app.post('/api/summarize', upload.single('file'), async (req, res) => {
  try {
    let transcript = req.body.transcript || '';
    const prompt = req.body.prompt || 'Summarize the key points and action items.';

    if (req.file) {
      const raw = await fs.readFile(req.file.path, 'utf8');
      transcript = raw + (transcript ? `\n\nAdditional text:\n${transcript}` : '');
      await fs.unlink(req.file.path).catch(() => {});
    }

    if (!transcript || transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Transcript is required and should be at least 10 characters.' });
    }

    const system = 'You produce faithful, structured summaries from transcripts.';
    const userContent = buildPrompt({ transcript, customInstruction: prompt });

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || '';
    return res.json({ summary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

// --- Email endpoint ---
// Body: { to: string[]|string, subject?: string, body: string }
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, body } = req.body || {};
    if (!to || !body) return res.status(400).json({ error: 'Fields "to" and "body" are required.' });

    const recipients = Array.isArray(to)
      ? to
      : String(to)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    if (!recipients.length) return res.status(400).json({ error: 'No valid recipients provided.' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Create both plain text and HTML versions
    const emailSubject = subject || 'Meeting Summary';
    const htmlContent = createHtmlEmail(body, emailSubject);

    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: recipients.join(','),
      subject: emailSubject,
      text: body, // Plain text fallback
      html: htmlContent, // Formatted HTML version
    });

    return res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));