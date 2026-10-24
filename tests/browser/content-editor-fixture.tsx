import {createRoot} from 'react-dom/client';
import {ContentEditor} from '../../src/components/admin/content-editor';
import {defaultContentDocument} from '../../src/lib/storefront-content';

// Isolated real form; its HTTP endpoint is served only by the test harness.
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:1100,margin:'auto',padding:16}} dir="rtl">
  <ContentEditor initial={defaultContentDocument()} isDemo={new URLSearchParams(location.search).get('demo')==='1'}/>
</main>);
