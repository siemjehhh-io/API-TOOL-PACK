import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import React, { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

const queryClient = new QueryClient();

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FDFBD4] text-[#23321B] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl clay-badge text-white flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-[#23321B]">Terjadi Kendala Memuat Layanan</h2>
          <p className="text-sm text-[#596B4F] max-w-md mb-6 leading-relaxed">
            Sistem mendeteksi pembaruan versi atau kendala koneksi sementara. Silakan muat ulang halaman untuk memperbarui cache aplikasi.
          </p>
          <div className="p-3 rounded-xl neu-inset border border-[#E8E2B5] text-xs font-mono text-rose-700 mb-6 max-w-lg overflow-x-auto">
            {this.state.error?.message || "Unknown error"}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl clay-btn-green font-bold text-sm text-white cursor-pointer"
          >
            <RefreshCw size={16} />
            Muat Ulang Aplikasi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Home />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
