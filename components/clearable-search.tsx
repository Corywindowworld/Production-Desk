"use client";

import {useRef, type InputHTMLAttributes} from "react";
import {X} from "lucide-react";

export function ClearableSearch({onClear, style, ...props}: InputHTMLAttributes<HTMLInputElement> & {onClear: () => void}) {
  const input = useRef<HTMLInputElement>(null);
  return <span className="clearable-search">
    <input {...props} ref={input} type="search" style={{...style, width:"100%", paddingRight:44}} />
    {String(props.value ?? "").length > 0 && <button
      type="button" className="clear-search-button" aria-label="Clear search" title="Clear search"
      disabled={props.disabled || props.readOnly}
      onClick={event => {event.preventDefault(); event.stopPropagation(); onClear(); input.current?.focus();}}
    ><X size={18} aria-hidden="true" /></button>}
  </span>;
}
