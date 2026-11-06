import Image from 'next/image';

/** Original PNG embedded in the customer-supplied ICO, displayed without cropping. */
export function BrandLogo(){
 return <span className="brand-logo" aria-hidden="true"><Image src="/brand/reselat-mark.png" alt="" width={256} height={256} unoptimized priority draggable={false}/></span>;
}
