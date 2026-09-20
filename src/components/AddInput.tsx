import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Icon } from './Icon';

export function AddInput() {
  const { addInputRef, addTask } = useApp();
  const [value, setValue] = useState('');

  const commit = () => {
    const text = value.trim();
    if (!text) return;
    setValue('');
    void addTask(text);
    addInputRef.current?.focus();
  };

  return (
    <div className="add-box">
      <button type="button" className="plus" title="新增" onClick={commit}>
        <Icon name="plus" size={15} />
      </button>
      <input
        ref={addInputRef}
        value={value}
        maxLength={140}
        autoComplete="off"
        placeholder="新增待办 ..."
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setValue('');
            e.currentTarget.blur();
          }
        }}
      />
      <span className="pr-1 text-[11.5px] text-ink-faint">回车连续添加</span>
    </div>
  );
}
