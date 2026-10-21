import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Cpu,
  User,
  Bot,
  Terminal,
  Eraser,
  Paperclip,
  X
} from 'lucide-react';
import { askExpert, analyzeMedia } from '../services/geminiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'INITIALIZED. I am the Steganalysis Expert AI. I can explain the methodologies, datasets, and detection challenges found in current research. How can I assist your forensic analysis today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image file size exceeds 5MB. Please choose a smaller image.');
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedImage) || isLoading) return;

    const userMsg = input.trim();
    const currentImg = attachedImage;

    setMessages(prev => [...prev, { role: 'user', content: userMsg || (currentImg ? 'Analyzing attached image.' : 'No message.') , image: currentImg || undefined }]);
    
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      let responseContent: string;
      if (currentImg) {
        responseContent = await analyzeMedia(userMsg || 'Expert analysis needed.', currentImg);
      } else {
        responseContent = await askExpert(userMsg);
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: responseContent }]);
    } catch (error) {
      console.error("Error communicating with Gemini AI:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'ERROR: AI service failed to respond. Please try again or check your API key/network connection.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'SESSION_RESET. Command buffer cleared.' }]);
  };

  return (
    <div className="flex flex-col h-[70vh] max-w-4xl mx-auto glass-panel rounded-xl overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-border-main bg-bg-surface/30 flex justify-between items-center">
        <div className="flex items-center gap-3">
           <div className="relative">
             <div className="w-8 h-8 rounded-full bg-[#00FF00]/20 border border-[#00FF00]/40 flex items-center justify-center">
               <Cpu className="w-4 h-4 text-[#00FF00]" />
             </div>
             <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#00FF00] rounded-full border-2 border-[#0d0d0d] animate-pulse" />
           </div>
           <div>
             <h3 className="text-xs font-bold text-white uppercase tracking-widest">GEMINI_FORENSIC_EXPERT</h3>
             <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">Neural Network Layer Active</p>
           </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
          title="Clear Buffer"
          aria-label="Clear Chat Buffer"
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center border ${
                msg.role === 'user'
                  ? 'bg-bg-surface border-border-main'
                  : 'bg-accent-primary/10 border-accent-primary/20'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-text-dim" /> : <Bot className="w-4 h-4 text-accent-primary" />}
              </div>
              <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'glass-panel bg-opacity-40 text-text-main'
                  : 'glass-panel bg-opacity-20 text-text-main py-4'
              }`}>
                {msg.content}
                {msg.image && msg.role === 'user' && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-zinc-700">
                    <img src={msg.image} alt="User Attachment" className="max-w-full h-auto object-contain" style={{ maxHeight: '200px' }} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#00FF00]/10 border border-[#00FF00]/20 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-[#00FF00]" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex gap-1 items-center">
                   <div className="w-1 h-1 bg-[#00FF00] rounded-full animate-bounce" />
                   <div className="w-1 h-1 bg-[#00FF00] rounded-full animate-bounce [animation-delay:0.2s]" />
                   <div className="w-1 h-1 bg-[#00FF00] rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-bg-surface/30 border-t border-border-main">
        <AnimatePresence>
          {attachedImage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 relative w-24 aspect-square bg-black border border-[#00FF00]/30 rounded-lg overflow-hidden group"
            >
               <img src={attachedImage} alt="Attachment Preview" className="w-full h-full object-cover" />
               <button
                onClick={() => setAttachedImage(null)}
                className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove attached image"
               >
                 <X className="w-3 h-3" />
               </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative max-w-2xl mx-auto flex gap-2">
          <div className="relative flex-1">
            <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Query the database or attach image..."
              className="w-full bg-bg-main/40 border border-border-main rounded-lg pl-10 pr-12 py-3 text-xs text-accent-primary focus:border-accent-primary/50 outline-none transition-all placeholder:text-text-dim/40 font-mono"
              aria-label="Chat input"
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${attachedImage ? 'text-[#00FF00] bg-[#00FF00]/10' : 'text-zinc-600 hover:text-zinc-400'}`}
              title="Attach Forensic Image"
              aria-label="Attach Forensic Image"
            >
               <Paperclip className="w-4 h-4" />
               <input type="file" ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !attachedImage) || isLoading}
            className="px-4 bg-[#00FF00] text-black rounded-lg hover:bg-[#33FF33] transition-colors disabled:opacity-30 disabled:cursor-not-allowed group h-[42px]"
            title="Send your message or image to the AI expert."
            aria-label="Send Message"
          >
            <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <div className="flex justify-center mt-3 gap-4">
           {['What is BOSSbase?', 'Explain DCT Domain', 'How to detect HILL?'].map(tag => (
             <button
              key={tag}
              onClick={() => setInput(tag)}
              className="text-[9px] text-zinc-600 hover:text-[#00FF00] transition-colors uppercase font-bold tracking-tighter"
              title={`Quick-set input to: ${tag}`}
              aria-label={`Set input to "${tag}"`}
             >
               {tag}
             </button>
           ))}
        </div>
      </div>
    </div>
  );
}
