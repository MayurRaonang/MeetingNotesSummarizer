import React, { useState } from 'react';
import './landingPage.css';

// Simple markdown renderer component
const MarkdownRenderer = ({ content }) => {
  const renderMarkdown = (text) => {
    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Tables
      .replace(/^\|(.+)\|$/gim, (match, content) => {
        const cells = content.split('|').map(cell => cell.trim());
        const isHeader = cells.every(cell => cell.includes('---') || cell.length === 0);
        if (isHeader) return '<tr class="table-separator"></tr>';
        
        const cellTags = cells.map(cell => `<td>${cell}</td>`).join('');
        return `<tr>${cellTags}</tr>`;
      })
      // Line breaks
      .replace(/\n/g, '<br/>');
  };

  return (
    <div 
      className="markdown-content" 
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
};

const LandingPage = () => {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [prompt, setPrompt] = useState('Summarize the key points and action items.');
  const [summary, setSummary] = useState('');
  const [editableSummary, setEditableSummary] = useState('');
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState('Meeting Summary');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [message, setMessage] = useState('');

  const API_BASE_URL =  'http://localhost:8080';

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'text/plain') {
      setFile(selectedFile);
    } else {
      setMessage('Please select a valid .txt file');
      setFile(null);
    }
  };

  const handleGenerateSummary = async (e) => {
    e.preventDefault();
    
    if (!file && !transcript.trim()) {
      setMessage('Please upload a file or enter transcript text');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }
      formData.append('transcript', transcript);
      formData.append('prompt', prompt);

      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setSummary(data.summary);
        setEditableSummary(data.summary);
        setMessage('Summary generated successfully!');
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    
    if (!editableSummary.trim() || !recipients.trim()) {
      setMessage('Please ensure you have a summary and at least one recipient');
      return;
    }

    setIsEmailSending(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipients,
          subject: subject,
          body: editableSummary,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Email sent successfully!');
        setRecipients('');
      } else {
        setMessage(`Error sending email: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsEmailSending(false);
    }
  };

  const clearAll = () => {
    setFile(null);
    setTranscript('');
    setPrompt('Summarize the key points and action items.');
    setSummary('');
    setEditableSummary('');
    setRecipients('');
    setSubject('Meeting Summary');
    setMessage('');
    document.getElementById('file-input').value = '';
  };

  return (
    <div className="container">
      <header className="header">
        <h1>AI Meeting Notes Summarizer</h1>
        <p>Upload your meeting transcript and get AI-powered summaries</p>
      </header>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="main-content">
        {/* Input Section */}
        <section className="input-section">
          <h2>Step 1: Upload Transcript</h2>
          <form onSubmit={handleGenerateSummary}>
            <div className="form-group">
              <label htmlFor="file-input">Upload Text File (.txt)</label>
              <input
                id="file-input"
                type="file"
                accept=".txt"
                onChange={handleFileChange}
              />
              {file && <p className="file-info">Selected: {file.name}</p>}
            </div>

            <div className="form-group">
              <label htmlFor="transcript">Or Paste Transcript Text</label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your meeting transcript here..."
                rows="6"
              />
            </div>

            <div className="form-group">
              <label htmlFor="prompt">Custom Instruction</label>
              <input
                id="prompt"
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Summarize in bullet points for executives"
              />
            </div>

            <div className="button-group">
              <button type="submit" disabled={isLoading} className="primary-btn">
                {isLoading ? 'Generating...' : 'Generate Summary'}
              </button>
              <button type="button" onClick={clearAll} className="secondary-btn">
                Clear All
              </button>
            </div>
          </form>
        </section>

        {/* Summary Section */}
        {summary && (
          <section className="summary-section">
            <h2>Step 2: Review & Edit Summary</h2>
            
            {/* Formatted Preview */}
            <div className="summary-preview">
              <h3>Formatted Preview:</h3>
              <div className="preview-container">
                <MarkdownRenderer content={editableSummary} />
              </div>
            </div>
            
            {/* Editable Raw Text */}
            <div className="form-group">
              <label htmlFor="editable-summary">Edit Summary (Markdown)</label>
              <textarea
                id="editable-summary"
                value={editableSummary}
                onChange={(e) => setEditableSummary(e.target.value)}
                rows="10"
              />
            </div>
          </section>
        )}

        {/* Email Section */}
        {editableSummary && (
          <section className="email-section">
            <h2>Step 3: Share via Email</h2>
            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label htmlFor="recipients">Recipients (comma-separated)</label>
                <input
                  id="recipients"
                  type="text"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="subject">Email Subject</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <button type="submit" disabled={isEmailSending} className="primary-btn">
                {isEmailSending ? 'Sending...' : 'Send Email'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
};

export default LandingPage;