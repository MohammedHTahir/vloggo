import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, User, Bot, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isEscalated?: boolean;
}

interface SupportChatProps {
  className?: string;
}

export function SupportChat({ className }: SupportChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const addMessage = (text: string, sender: 'user' | 'ai', isEscalated = false) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      text,
      sender,
      timestamp: new Date(),
      isEscalated
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText.trim();
    setInputText('');
    addMessage(userMessage, 'user');

    // Check if user wants human support
    if (userMessage.toLowerCase().includes('human') || 
        userMessage.toLowerCase().includes('support') ||
        userMessage.toLowerCase().includes('agent') ||
        userMessage.toLowerCase().includes('representative')) {
      await escalateToHuman(userMessage);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('support-chat', {
        body: {
          message: userMessage,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          }))
        }
      });

      if (error) {
        console.error('Support chat error:', error);
        addMessage('Sorry, I encountered an error. Would you like to speak with a human support agent?', 'ai');
        return;
      }

      if (data?.success && data?.response) {
        addMessage(data.response, 'ai');
      } else {
        addMessage('I apologize, but I couldn\'t process your request. Would you like to speak with a human support agent?', 'ai');
      }
    } catch (error) {
      console.error('Error calling support chat:', error);
      addMessage('Sorry, I\'m having trouble connecting. Would you like to speak with a human support agent?', 'ai');
    } finally {
      setIsLoading(false);
    }
  };

  const escalateToHuman = async (originalMessage: string) => {
    setIsEscalated(true);
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'Unknown user';

      const { data, error } = await supabase.functions.invoke('escalate-support', {
        body: {
          userEmail,
          message: originalMessage,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          }))
        }
      });

      if (error) {
        console.error('Escalation error:', error);
        addMessage('Sorry, I couldn\'t escalate your request. Please email us directly at support@vloggo.ai', 'ai', true);
        toast.error('Failed to escalate to human support');
        return;
      }

      if (data?.success) {
        addMessage('I\'ve escalated your request to our human support team. You should receive an email response shortly at your registered email address. Thank you for your patience!', 'ai', true);
        toast.success('Support request escalated successfully');
      } else {
        addMessage('I couldn\'t escalate your request automatically. Please email us directly at support@vloggo.ai', 'ai', true);
        toast.error('Failed to escalate to human support');
      }
    } catch (error) {
      console.error('Error escalating support:', error);
      addMessage('I\'m having trouble escalating your request. Please email us directly at support@vloggo.ai', 'ai', true);
      toast.error('Failed to escalate to human support');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setIsEscalated(false);
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {!isOpen ? (
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      ) : (
        <Card className="w-80 h-96 bg-white/95 backdrop-blur-sm border shadow-xl">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <span className="font-semibold">Support</span>
                {isEscalated && (
                  <Badge variant="secondary" className="bg-white/20 text-white">
                    <Mail className="h-3 w-3 mr-1" />
                    Escalated
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetChat}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <Bot className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-sm">Hi! I'm your AI assistant.</p>
                  <p className="text-xs mt-1">Ask me anything about VlogGo, or type "human support" to speak with our team.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 ${
                          message.sender === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : message.isEscalated
                            ? 'bg-orange-100 text-orange-800 border border-orange-200'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {message.sender === 'ai' && (
                            <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          )}
                          {message.sender === 'user' && (
                            <User className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="text-sm">{message.text}</div>
                        </div>
                        <div className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-800 rounded-lg px-3 py-2 max-w-[80%]">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || isLoading}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Type "human support" to speak with our team
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
