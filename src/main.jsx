import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error || "Unknown error"),
      stack: error instanceof Error ? String(error.stack || "") : "",
    };
  }

  componentDidCatch(error, info) {
    // Keep this log for production debugging when UI would otherwise be blank.
    console.error("[RootErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#f5f2ec", color: "#2f2a22", padding: 24, fontFamily: "Noto Sans JP, sans-serif" }}>
        <h1 style={{ fontSize: 22, marginBottom: 10 }}>画面エラーが発生しました</h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          生成結果の反映中にフロントエラーが発生しました。下の内容を共有してください。
        </p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #d8cfbf", padding: 12, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
          {this.state.message}
        </pre>
        {this.state.stack ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #d8cfbf", padding: 12, fontSize: 11, lineHeight: 1.45, maxHeight: "45vh", overflow: "auto" }}>
            {this.state.stack}
          </pre>
        ) : null}
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 12, border: "1px solid #bfa57a", background: "linear-gradient(135deg,#f3e1be 0%,#e4c488 56%,#cfa567 100%)", color: "#3b3328", padding: "10px 14px", cursor: "pointer" }}
        >
          再読み込み
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
