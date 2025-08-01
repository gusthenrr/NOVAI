import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; // ou outro tema se preferir

type RespostaFormatadaProps = {
  resposta: string;
};

const RespostaFormatada: React.FC<RespostaFormatadaProps> = ({ resposta }) => {
  return (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      <ReactMarkdown
        children={resposta}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      />
    </div>
  );
};

export default RespostaFormatada;