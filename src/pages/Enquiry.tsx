import { Helmet } from "react-helmet-async";
import CharterSearch from "./admin/CharterSearch";

export default function Enquiry() {
  return (
    <>
      <Helmet>
        <title>Request a Charter Quote — Eclipse Air Charter</title>
        <meta
          name="description"
          content="Request a private jet charter quote from Eclipse Air Charter. Tell us your route, dates and passenger count and our team will respond with options."
        />
        <link rel="canonical" href="https://search.eclipseaircharter.com/request" />
        <meta property="og:title" content="Request a Charter Quote — Eclipse Air Charter" />
        <meta property="og:url" content="https://search.eclipseaircharter.com/request" />
        <meta
          property="og:description"
          content="Request a private jet charter quote from Eclipse Air Charter."
        />
      </Helmet>
      <CharterSearch />
    </>
  );
}
