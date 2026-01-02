import React, { useRef, useEffect } from 'react';
import { DiscordMessage } from '../types';

interface Props {
  messages: DiscordMessage[];
}

const DiscordPreview: React.FC<Props> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="bg-[#313338] rounded-xl border border-gray-900 overflow-hidden flex flex-col h-[500px]">
      {/* Header */}
      <div className="h-12 border-b border-[#26272D] flex items-center px-4 shadow-sm bg-[#313338] z-10">
        <span className="text-[#80848E] text-2xl mr-2">#</span>
        <span className="font-bold text-white">伺服器公告</span>
        <span className="border-l border-[#3F4147] h-6 mx-4"></span>
        <span className="text-xs text-[#B5BAC1]">官方更新與維護日誌</span>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p>目前尚無訊息。</p>
            <p className="text-sm">執行操作後將在此顯示 Bot 回應。</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="group hover:bg-[#2e3035] -mx-4 px-4 py-1 flex gap-4">
            <img src={msg.avatar} alt="Bot" className="w-10 h-10 rounded-full mt-1" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium hover:underline cursor-pointer">
                  {msg.author}
                </span>
                <span className="bg-[#5865F2] text-white text-[10px] px-1 rounded flex items-center h-[15px]">BOT</span>
                <span className="text-[#949BA4] text-xs">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              {/* Message Content */}
              {msg.content && <p className="text-[#DBDEE1] whitespace-pre-wrap">{msg.content}</p>}

              {/* Embed */}
              {msg.embed && (
                <div className="mt-1 bg-[#2B2D31] rounded border-l-4 max-w-[500px]" style={{ borderLeftColor: msg.embed.color }}>
                  <div className="p-4 grid gap-2">
                    <h3 className="font-bold text-white">{msg.embed.title}</h3>
                    <p className="text-[#DBDEE1] text-sm whitespace-pre-wrap">{msg.embed.description}</p>
                    
                    {msg.embed.fields && (
                      <div className="grid grid-cols-12 gap-2 mt-2">
                        {msg.embed.fields.map((field, idx) => (
                          <div key={idx} className={`${field.inline ? 'col-span-4' : 'col-span-12'}`}>
                            <div className="text-[#B5BAC1] font-bold text-xs uppercase mb-1">{field.name}</div>
                            <div className="text-[#DBDEE1] text-sm">{field.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {msg.embed.footer && (
                        <div className="text-[#949BA4] text-xs mt-2 pt-2 border-t border-[#383A40] flex justify-between">
                            <span>{msg.embed.footer.text}</span>
                            <span>{new Date().toISOString().split('T')[0]}</span>
                        </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Input Placeholder */}
      <div className="p-4 bg-[#313338]">
        <div className="bg-[#383A40] rounded-lg h-11 flex items-center px-4 text-[#949BA4]">
          您沒有權限在此頻道發送訊息。
        </div>
      </div>
    </div>
  );
};

export default DiscordPreview;